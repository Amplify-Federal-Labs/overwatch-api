import type { AliasSource } from "./types";

export interface EntityAliasProps {
	alias: string;
	source: AliasSource;
	createdAt: string;
}

export class EntityAlias {
	readonly alias: string;
	readonly source: AliasSource;
	readonly createdAt: string;

	constructor(props: EntityAliasProps) {
		this.alias = props.alias;
		this.source = props.source;
		this.createdAt = props.createdAt;
	}

	matches(name: string): boolean {
		return this.alias.toLowerCase().trim() === name.toLowerCase().trim();
	}
}
