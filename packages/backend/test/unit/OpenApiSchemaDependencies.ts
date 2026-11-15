/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { convertSchemaToOpenApiSchema } from '@/server/api/openapi/schemas.js';
import { paramDef } from '@/server/api/endpoints/hanami-impressions.js';
import { detailObservation, imageObservation, interactionIdentity, replyObservation, viewportObservation } from '../utils/HanamiInteractionsFixture.js';

const ajv = new Ajv2020({ strict: true, strictRequired: false });

/**
 * Oracle: https://json-schema.org/understanding-json-schema/reference/conditionals
 * defines pre-2019-09 dependencies arrays as dependentRequired and schema values as
 * dependentSchemas. Dependencies apply only when their triggering property is present,
 * and are not implicitly bidirectional. The expected acceptance decisions below are
 * fixed examples of that contract; Ajv 2020 validates the converted public schema.
 */
describe('OpenAPI 3.1 dependency conversion', () => {
	test('requires an array dependency only when its triggering property is present', () => {
		const schema = {
			type: 'object',
			properties: { windowId: { type: 'string' }, windowSequence: { type: 'integer' } },
			dependencies: { windowId: ['windowSequence'] },
		} as const;
		const converted = convertSchemaToOpenApiSchema(schema, 'param', false);
		expect(converted).not.toHaveProperty('dependencies');
		expect(converted.dependentRequired).toEqual({ windowId: ['windowSequence'] });
		const validate = ajv.compile(converted);
		expect(validate({})).toBe(true);
		expect(validate({ windowSequence: 0 })).toBe(true);
		expect(validate({ windowId: 'window-a', windowSequence: 0 })).toBe(true);
		expect(validate({ windowId: 'window-a' })).toBe(false);
	});

	test('recursively converts schema dependencies without applying them unconditionally', () => {
		const schema = {
			type: 'object',
			properties: { windowId: { type: 'string' }, windowSequence: { type: 'integer' }, windowElapsedMs: { type: 'integer' } },
			dependencies: { windowId: {
				type: 'object', required: ['windowSequence'], dependencies: { windowSequence: ['windowElapsedMs'] },
			} },
		} as const;
		const converted = convertSchemaToOpenApiSchema(schema, 'param', false);
		expect(converted).not.toHaveProperty('dependencies');
		expect(converted.dependentSchemas).toEqual({ windowId: {
			type: 'object', required: ['windowSequence'], dependentRequired: { windowSequence: ['windowElapsedMs'] },
		} });
		const validate = ajv.compile(converted);
		expect(validate({})).toBe(true);
		expect(validate({ windowSequence: 0 })).toBe(true);
		expect(validate({ windowId: 'window-a' })).toBe(false);
		expect(validate({ windowId: 'window-a', windowSequence: 0 })).toBe(false);
		expect(validate({ windowId: 'window-a', windowSequence: 0, windowElapsedMs: 0 })).toBe(true);
	});

	/** Boolean schemas are schema-valued dependencies too: false rejects the object when triggered, while true imposes no additional condition. This tests that branch without requiring general top-level boolean-schema support. */
	test('preserves true and false schema dependencies', () => {
		const schema = {
			type: 'object',
			properties: { windowId: { type: 'string' }, windowSequence: { type: 'integer' } },
			dependencies: { windowId: false, windowSequence: true },
		} as const;
		const converted = convertSchemaToOpenApiSchema(schema, 'param', false);
		expect(converted).not.toHaveProperty('dependencies');
		expect(converted.dependentSchemas).toEqual({ windowId: false, windowSequence: true });
		const validate = ajv.compile(converted);
		expect(validate({})).toBe(true);
		expect(validate({ windowSequence: 0 })).toBe(true);
		expect(validate({ windowId: 'window-a' })).toBe(false);
		expect(validate({ windowId: 'window-a', windowSequence: 0 })).toBe(false);
	});

	/**
	 * Oracle: hanami-impressions permits absent window metadata, but any supplied member
	 * requires windowId, windowSequence and windowElapsedMs together. Both published
	 * version branches contain six affected observation variants. The actual paramDef
	 * supplies the generator's oneOf -> object property -> array items -> oneOf path;
	 * the three-field requirement and examples are stated independently here. Version 3
	 * schema publication is tested, not its separate runtime REFRESH_REQUIRED policy.
	 */
	test('preserves the observation metadata contract in every published nested variant without changing API input schemas', () => {
		const original = structuredClone(paramDef);
		const converted = convertSchemaToOpenApiSchema(paramDef, 'param', false);
		const dependencies = {
			windowId: ['windowId', 'windowSequence', 'windowElapsedMs'],
			windowSequence: ['windowId', 'windowSequence', 'windowElapsedMs'],
			windowElapsedMs: ['windowId', 'windowSequence', 'windowElapsedMs'],
		};
		for (const branch of converted.oneOf.slice(0, 2)) {
			const variants = branch.properties.observations.items.oneOf.slice(0, 6);
			expect(variants).toHaveLength(6);
			for (const variant of variants) {
				expect(variant).not.toHaveProperty('dependencies');
				expect(variant.dependentRequired).toEqual(dependencies);
			}
		}
		const validate = ajv.compile(converted);
		const metadata = { windowId: 'window-a', windowSequence: 1, windowElapsedMs: 0 };
		const observations = [
			viewportObservation(), detailObservation(), imageObservation(), replyObservation(),
			{ ...interactionIdentity, kind: 'action', action: 'follow' },
			{ ...interactionIdentity, kind: 'feedback' },
		];
		for (const version of [4, 3]) {
			for (const observation of observations) {
				expect(validate({ version, observations: [observation] })).toBe(true);
				expect(validate({ version, observations: [{ ...observation, ...metadata }] })).toBe(true);
				for (const missing of ['windowId', 'windowSequence', 'windowElapsedMs']) {
					const partial: Record<string, unknown> = { ...observation, ...metadata };
					delete partial[missing];
					expect(validate({ version, observations: [partial] })).toBe(false);
				}
			}
		}
		expect(paramDef).toEqual(original);
	});
});
