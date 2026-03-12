import { describe, it, expect, vi, beforeEach } from "vitest";
import { routeQueueMessage } from "./queue-router";
import type { IngestionMessage, ExtractionMessage, ResolutionMessage, SynthesisMessage, EnrichmentMessage, MaterializationMessage } from "./types";

function makeHandlers() {
	return {
		onIngestion: vi.fn(),
		onExtraction: vi.fn(),
		onResolution: vi.fn(),
		onSynthesis: vi.fn(),
		onEnrichment: vi.fn(),
		onMaterialization: vi.fn(),
	};
}

describe("queue-router", () => {
	it("should route ingestion messages to the ingestion handler", async () => {
		const handlers = makeHandlers();
		handlers.onIngestion.mockResolvedValue({ itemsFetched: 5, itemsStored: 3 });

		const message: IngestionMessage = { type: "ingestion", source: "sam_gov" };
		await routeQueueMessage(message, handlers);

		expect(handlers.onIngestion).toHaveBeenCalledWith("sam_gov");
		expect(handlers.onExtraction).not.toHaveBeenCalled();
		expect(handlers.onResolution).not.toHaveBeenCalled();
		expect(handlers.onSynthesis).not.toHaveBeenCalled();
		expect(handlers.onMaterialization).not.toHaveBeenCalled();
	});

	it("should route extraction messages to the extraction handler", async () => {
		const handlers = makeHandlers();
		handlers.onExtraction.mockResolvedValue({ observationsExtracted: 2 });

		const message: ExtractionMessage = { type: "extraction", ingestedItemId: "item-1" };
		await routeQueueMessage(message, handlers);

		expect(handlers.onExtraction).toHaveBeenCalledWith("item-1");
		expect(handlers.onIngestion).not.toHaveBeenCalled();
	});

	it("should route resolution messages to the resolution handler", async () => {
		const handlers = makeHandlers();
		handlers.onResolution.mockResolvedValue({ resolvedCount: 2 });

		const entities: ResolutionMessage["entities"] = [
			{ rawName: "US Army", entityType: "agency", role: "buyer" },
			{ rawName: "Booz Allen", entityType: "company", role: "vendor" },
		];
		const message: ResolutionMessage = { type: "resolution", observationId: 42, entities };
		await routeQueueMessage(message, handlers);

		expect(handlers.onResolution).toHaveBeenCalledWith({
			observationId: 42,
			entities,
		});
		expect(handlers.onIngestion).not.toHaveBeenCalled();
		expect(handlers.onExtraction).not.toHaveBeenCalled();
	});

	it("should route synthesis messages to the synthesis handler", async () => {
		const handlers = makeHandlers();
		handlers.onSynthesis.mockResolvedValue({ synthesized: true });

		const message: SynthesisMessage = { type: "synthesis", profileId: "profile-1" };
		await routeQueueMessage(message, handlers);

		expect(handlers.onSynthesis).toHaveBeenCalledWith("profile-1");
		expect(handlers.onIngestion).not.toHaveBeenCalled();
		expect(handlers.onExtraction).not.toHaveBeenCalled();
		expect(handlers.onResolution).not.toHaveBeenCalled();
		expect(handlers.onMaterialization).not.toHaveBeenCalled();
	});

	it("should route materialization messages to the materialization handler", async () => {
		const handlers = makeHandlers();
		handlers.onMaterialization.mockResolvedValue({ materialized: true });

		const message: MaterializationMessage = { type: "materialization", ingestedItemId: "item-1" };
		await routeQueueMessage(message, handlers);

		expect(handlers.onMaterialization).toHaveBeenCalledWith("item-1");
		expect(handlers.onIngestion).not.toHaveBeenCalled();
		expect(handlers.onSynthesis).not.toHaveBeenCalled();
	});

	it("should route enrichment messages to the enrichment handler", async () => {
		const handlers = makeHandlers();
		handlers.onEnrichment.mockResolvedValue({ enriched: true });

		const message: EnrichmentMessage = {
			type: "enrichment",
			profileId: "p-1",
			entityType: "person",
			canonicalName: "John Smith",
		};
		await routeQueueMessage(message, handlers);

		expect(handlers.onEnrichment).toHaveBeenCalledWith({
			profileId: "p-1",
			entityType: "person",
			canonicalName: "John Smith",
		});
		expect(handlers.onIngestion).not.toHaveBeenCalled();
		expect(handlers.onSynthesis).not.toHaveBeenCalled();
	});

	it("should throw on unknown message type", async () => {
		const handlers = makeHandlers();
		const badMessage = { type: "unknown" } as never;

		await expect(routeQueueMessage(badMessage, handlers)).rejects.toThrow(
			"Unknown queue message type: unknown",
		);
	});
});
