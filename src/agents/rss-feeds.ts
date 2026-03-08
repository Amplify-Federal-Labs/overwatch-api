export interface RssFeedConfig {
	url: string;
	sourceName: string;
}

export const RSS_FEEDS: readonly RssFeedConfig[] = [
	{ url: "https://www.govconwire.com/feed", sourceName: "GovConWire" },
	{ url: "https://fedscoop.com/feed/", sourceName: "FedScoop" },
	{ url: "https://www.defenseone.com/rss/all/", sourceName: "DefenseOne" },
	{ url: "https://federalnewsnetwork.com/feed/", sourceName: "FederalNewsNetwork" },
] as const;
