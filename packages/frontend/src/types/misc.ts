/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import type { InjectionKey } from 'vue';

export type Awaitable <T> = T | Promise<T>;

type TupleOf<T, N extends number, R extends unknown[]> = R['length'] extends N ? R : TupleOf<T, N, [T, ...R]>;
export type Tuple<T, N extends number> = N extends N ? number extends N ? T[] : TupleOf<T, N, []> : never;

export type ExtractInjectedType<T extends InjectionKey<any>> = T extends InjectionKey<infer U> ? U : never;
