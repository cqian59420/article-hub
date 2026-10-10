import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
export const prerender = false;

type ArticleDatabase = {
	prepare(query: string): {
		bind(...values: (string | null)[]): {
			run(): Promise<unknown>;
		};
	};
};

type PublishEnv = {
	DB: ArticleDatabase;
	PUBLISH_TOKEN?: string;
};

const DESKTOP_USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function extractMetaContent(html: string, property: string): string {
	const patterns = [
		new RegExp(`<meta[^>]+property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'),
		new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i'),
	];

	for (const pattern of patterns) {
		const match = html.match(pattern);
		if (match) {
			return match[1];
		}
	}

	return '';
}

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

function formatBeijingDate(timestampSeconds: number): string {
	const date = new Date((timestampSeconds + 8 * 60 * 60) * 1000);
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export const POST: APIRoute = async ({ request }) => {
	const { DB: database, PUBLISH_TOKEN: publishToken } = env as unknown as PublishEnv;

	const token = request.headers.get('x-publish-token');
	if (!publishToken || token !== publishToken) {
		return Response.json({ error: '口令不正确，请输入发布口令。' }, { status: 401 });
	}

	let url = '';
	try {
		const body = (await request.json()) as { url?: unknown };
		if (body && typeof body.url === 'string') {
			url = body.url.trim();
		}
	} catch {
		// JSON 解析失败时按缺少 url 处理
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(url);
	} catch {
		return Response.json({ error: '请提供有效的文章链接。' }, { status: 400 });
	}

	if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
		return Response.json({ error: '文章链接需要以 http 或 https 开头。' }, { status: 400 });
	}

	let html = '';
	try {
		const response = await fetch(parsedUrl.href, {
			headers: { 'User-Agent': DESKTOP_USER_AGENT },
		});
		if (!response.ok) {
			return Response.json(
				{ error: '抓取文章失败，请确认链接可以在浏览器中打开。' },
				{ status: 422 },
			);
		}
		html = await response.text();
	} catch {
		return Response.json({ error: '抓取文章失败，请稍后再试。' }, { status: 422 });
	}

	const title = decodeHtmlEntities(extractMetaContent(html, 'og:title'));
	if (!title) {
		return Response.json({ error: '解析文章失败，未找到文章标题。' }, { status: 422 });
	}

	const summary = decodeHtmlEntities(extractMetaContent(html, 'og:description'));
	const coverUrl = decodeHtmlEntities(extractMetaContent(html, 'og:image'));

	const timestampMatch = html.match(/create_timestamp["']?\s*[:=]\s*["']?(\d+)/);
	const publishedAt = timestampMatch ? formatBeijingDate(Number(timestampMatch[1])) : null;

	try {
		await database
			.prepare(
				`INSERT INTO articles (title, summary, source_url, cover_url, category, tags, published_at, status)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(title, summary, url, coverUrl, '未分类', '', publishedAt, 'published')
			.run();
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);

		if (errorMessage.includes('UNIQUE constraint failed')) {
			return Response.json({ error: '该文章已发布过' }, { status: 409 });
		}

		console.error(`写入文章失败: ${errorMessage}`);
		return Response.json({ error: '保存文章失败，请稍后再试。' }, { status: 500 });
	}

	return Response.json({ ok: true });
};
