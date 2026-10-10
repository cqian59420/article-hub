import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

type ClickDatabase = {
	prepare(query: string): {
		bind(...values: number[]): {
			first(): Promise<{ source_url: string } | null>;
		};
	};
};

type ClickEnv = {
	DB: ClickDatabase;
};

export const GET: APIRoute = async ({ url, redirect }) => {
	const idParam = url.searchParams.get('id');

	if (idParam === null || !/^\d+$/.test(idParam)) {
		return redirect('/', 302);
	}

	const id = Number(idParam);
	if (!Number.isSafeInteger(id)) {
		return redirect('/', 302);
	}

	const database = (env as unknown as ClickEnv).DB;

	// ponytail: 无去重，被刷再加 IP 限频
	try {
		const row = await database
			.prepare(
				'UPDATE articles SET click_count = click_count + 1 WHERE id = ? RETURNING source_url',
			)
			.bind(id)
			.first();

		if (row?.source_url) {
			return redirect(row.source_url, 302);
		}
	} catch (error) {
		const errorMessage = error instanceof Error
			? `${error.name}: ${error.message}`
			: String(error);

		console.error(`记录文章点击失败: ${errorMessage}`);
	}

	return redirect('/', 302);
};
