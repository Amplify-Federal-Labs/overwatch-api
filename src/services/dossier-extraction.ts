import type { Dossier } from "../schemas";

export interface DossierExtractionService {
	extract(
		entityName: string,
		entityType: string,
		pageTexts: string[],
	): Promise<Dossier | null>;
}
