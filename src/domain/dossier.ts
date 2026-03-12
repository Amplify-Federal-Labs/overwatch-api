export type DossierKind = "person" | "agency" | "company";

const ENTITY_TYPE_TO_DOSSIER_KIND: Record<string, DossierKind> = {
	person: "person",
	agency: "agency",
	company: "company",
};

export function expectedDossierKind(entityType: string): DossierKind | null {
	return ENTITY_TYPE_TO_DOSSIER_KIND[entityType] ?? null;
}

export function isDossierKindValid(entityType: string, dossierKind: string): boolean {
	const expected = expectedDossierKind(entityType);
	return expected !== null && expected === dossierKind;
}
