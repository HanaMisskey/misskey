/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { comment, defaultDescription } from '@/server/web/views/_.js';
import { Splash } from '@/server/web/views/_splash.js';
import type { CommonProps } from '@/server/web/views/_.js';
import type { PropsWithChildren, Children } from '@kitajs/html';

export function Layout(props: PropsWithChildren<CommonProps<{
	title?: string;
	noindex?: boolean;
	desc?: string;
	img?: string;
	serverErrorImageUrl?: string;
	infoImageUrl?: string;
	notFoundImageUrl?: string;
	metaJson?: string;
	clientCtxJson?: string;

	titleSlot?: Children;
	descSlot?: Children;
	metaSlot?: Children;
	ogSlot?: Children;
}>>) {
	const now = Date.now();

	// 変数名をsafeで始めることでエラーをスキップ
	const safeMetaJson = props.metaJson;
	const safeClientCtxJson = props.clientCtxJson;

	return (
		<>
			{'<!DOCTYPE html>'}
			{comment}
			<html>
				<head>
					<meta charset="UTF-8" />
					<meta name="application-name" content="Misskey" />
					<meta name="referer" content="origin" />
					<meta name="theme-color" content={props.themeColor ?? '#86b300'} />
					<meta name="theme-color-orig" content={props.themeColor ?? '#86b300'} />
					<meta property="og:site_name" content={props.instanceName || 'Misskey'} />
					<meta property="instance_url" content={props.instanceUrl} />
					<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
					<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no" />
					<link rel="icon" href={props.icon || '/favicon.ico'} />
					<link rel="apple-touch-icon" href={props.appleTouchIcon || '/apple-touch-icon.png'} />
					<link rel="manifest" href="/manifest.json" />
					<link rel="search" type="application/opensearchdescription+xml" title={props.title || 'Misskey'} href={`${props.config.url}/opensearch.xml`} />
					{props.serverErrorImageUrl != null ? <link rel="prefetch" as="image" href={props.serverErrorImageUrl} /> : null}
					{props.infoImageUrl != null ? <link rel="prefetch" as="image" href={props.infoImageUrl} /> : null}
					{props.notFoundImageUrl != null ? <link rel="prefetch" as="image" href={props.notFoundImageUrl} /> : null}

					<link rel="preconnect" href="https://static-assets.misskey.flowers" />
					<link rel="preconnect" href="https://frame-static-assets.misskey.flowers" />
					<link rel="dns-prefetch" href="https://saize-static-assets.misskey.flowers" />

					<link rel="preconnect" href="https://fonts.googleapis.com" />
					<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
					<link rel="stylesheet" href="https://static-assets.misskey.flowers/fonts/hana-icons/font.css" />
					<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=BIZ+UDGothic:wght@400;700&family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap" />

					{props.icon != null ? <link rel="prefetch" as="image" href={props.icon} /> : null}

					{props.frontendViteFiles == null ? <script type="module" src="/vite/@vite/client"></script> : null}

					{(props.frontendViteFiles?.css ?? []).map((href) => (
						<link rel="stylesheet" href={`/vite/${href}`} />
					))}

					{props.titleSlot ?? <title safe>{props.title || 'Misskey'}</title>}

					{props.noindex ? <meta name="robots" content="noindex" /> : null}

					{props.descSlot ?? (props.desc != null ? <meta name="description" content={props.desc || defaultDescription} /> : null)}

					{props.metaSlot}

					{props.ogSlot ?? (
						<>
							<meta property="og:title" content={props.title || 'Misskey'} />
							<meta property="og:description" content={props.desc || defaultDescription} />
							{props.img != null ? <meta property="og:image" content={props.img} /> : null}
							<meta property="twitter:card" content="summary" />
						</>
					)}

					{props.frontendBootloaderCss != null ? <style safe>{props.frontendBootloaderCss}</style> : <link rel="stylesheet" href="/vite/loader/style.css" />}

					<script>
						const VERSION = '{props.version}';
						const CLIENT_ENTRY = {JSON.stringify(props.frontendViteFiles?.entryJs ?? null)};
						const LANGS = {JSON.stringify(props.langs)};
					</script>

					{safeMetaJson != null ? <script type="application/json" id="misskey_meta" data-generated-at={now}>{safeMetaJson}</script> : null}
					{safeClientCtxJson != null ? <script type="application/json" id="misskey_clientCtx" data-generated-at={now}>{safeClientCtxJson}</script> : null}

					{props.frontendBootloaderJs != null ? <script>{props.frontendBootloaderJs}</script> : <script src="/vite/loader/boot.js"></script>}
				</head>
				<body>
					<noscript>
						<p>
							JavaScriptを有効にしてください<br />
							Please turn on your JavaScript
						</p>
					</noscript>
					<Splash icon={props.icon} />
					{props.children}
				</body>
			</html>
		</>
	);
}

export { Layout as BasePage };

