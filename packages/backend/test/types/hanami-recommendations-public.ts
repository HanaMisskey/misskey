import type { Endpoints } from '../../../misskey-js/src/autogen/endpoint.js';

type Page = Endpoints['notes/hanami-recommendations']['res'];
type SameKeys<Actual, Expected> = [Actual] extends [Expected] ? [Expected] extends [Actual] ? true : false : false;
type Assert<T extends true> = T;

/** Oracle: docs/hanami-recommendations-page-contract.md fixes the entire public field set. Compile the checked-in generated SDK source, not a stale node_modules build; backend pnpm typecheck includes this fixture. */
export type PublicPageKeys = Assert<SameKeys<keyof Page, 'items' | 'nextCursor' | 'snapshotId' | 'algorithmVersion' | 'revision'>>;
export type PublicEntryKeys = Assert<SameKeys<keyof Page['items'][number], 'entryId' | 'note'>>;

/** Oracle: the public input adds an optional boolean withFiles and retains the three imageFilter values for existing callers. */
type Request = Endpoints['notes/hanami-recommendations']['req'];
export type PublicWithFiles = Assert<SameKeys<Request['withFiles'], boolean | undefined>>;
export type PublicImageFilter = Assert<SameKeys<Request['imageFilter'], 'any' | 'with_image' | 'without_image' | undefined>>;
export const omittedFileCondition: Request = {};
export const enabledFileCondition: Request = { withFiles: true };
export const disabledFileCondition: Request = { withFiles: false, imageFilter: 'without_image' };
