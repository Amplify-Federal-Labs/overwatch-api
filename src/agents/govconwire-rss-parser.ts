import { XMLParser } from "fast-xml-parser";
import type { SignalAnalysisInput } from "../schemas";

export interface GovConWireRssItem {
	title: string;
	link: string;
	pubDate: string;
	description: string;
	categories: string[];
	creator: string;
}

const rssParser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	removeNSPrefix: true,
	parseTagValue: false,
	isArray: (name) => name === "item" || name === "category",
});

function stripHtml(html: string): string {
	return html
		.replace(/<[^>]*>/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

export function parseGovConWireRss(xml: string): GovConWireRssItem[] {
	let parsed: Record<string, unknown>;
	try {
		parsed = rssParser.parse(xml) as Record<string, unknown>;
	} catch {
		return [];
	}

	const rss = parsed.rss as Record<string, unknown> | undefined;
	if (!rss) return [];

	const channel = rss.channel as Record<string, unknown> | undefined;
	if (!channel) return [];

	const rawItems = channel.item as Array<Record<string, unknown>> | undefined;
	if (!Array.isArray(rawItems)) return [];

	return rawItems.map((item) => {
		const rawDescription = typeof item.description === "string" ? item.description : "";
		const rawCategories = item.category;
		const categories: string[] = Array.isArray(rawCategories)
			? rawCategories.filter((c): c is string => typeof c === "string")
			: typeof rawCategories === "string"
				? [rawCategories]
				: [];

		return {
			title: typeof item.title === "string" ? item.title : "",
			link: typeof item.link === "string" ? item.link : "",
			pubDate: typeof item.pubDate === "string" ? item.pubDate : "",
			description: stripHtml(rawDescription),
			categories,
			creator: typeof item.creator === "string" ? item.creator : "",
		};
	});
}

export function rssItemsToSignals(items: GovConWireRssItem[]): SignalAnalysisInput[] {
	return items.map((item) => {
		const lines: string[] = [item.title];
		if (item.pubDate) lines.push(`Date: ${item.pubDate}`);
		if (item.categories.length > 0) lines.push(`Categories: ${item.categories.join(", ")}`);
		if (item.description) lines.push(item.description);

		return {
			content: lines.join("\n"),
			sourceType: "rss" as const,
			sourceName: "GovConWire",
			sourceLink: item.link,
		};
	});
}
