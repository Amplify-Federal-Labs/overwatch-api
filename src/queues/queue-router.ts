import type { QueueMessage, IngestionMessage, ResolutionMessage, EnrichmentMessage } from "./types";

export interface QueueHandlers {
	onIngestion(source: IngestionMessage["source"]): Promise<unknown>;
	onExtraction(ingestedItemId: string): Promise<unknown>;
	onResolution(input: { observationId: number; entities: ResolutionMessage["entities"] }): Promise<unknown>;
	onSynthesis(profileId: string): Promise<unknown>;
	onEnrichment(input: { profileId: string; entityType: string; canonicalName: string }): Promise<unknown>;
	onMaterialization(ingestedItemId: string): Promise<unknown>;
}

export async function routeQueueMessage(
	message: QueueMessage,
	handlers: QueueHandlers,
): Promise<void> {
	switch (message.type) {
		case "ingestion":
			await handlers.onIngestion(message.source);
			return;
		case "extraction":
			await handlers.onExtraction(message.ingestedItemId);
			return;
		case "resolution":
			await handlers.onResolution({
				observationId: message.observationId,
				entities: message.entities,
			});
			return;
		case "synthesis":
			await handlers.onSynthesis(message.profileId);
			return;
		case "enrichment":
			await handlers.onEnrichment({
				profileId: message.profileId,
				entityType: message.entityType,
				canonicalName: message.canonicalName,
			});
			return;
		case "materialization":
			await handlers.onMaterialization(message.ingestedItemId);
			return;
		default: {
			const msg = message as { type: string };
			throw new Error(`Unknown queue message type: ${msg.type}`);
		}
	}
}
