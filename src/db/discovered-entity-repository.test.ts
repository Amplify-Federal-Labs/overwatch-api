import { describe, it, expect } from "vitest";
import { buildDiscoveredEntityRow } from "./discovered-entity-repository";
import type { DiscoveredEntity } from "../signals/stakeholder-matcher";

const DISCOVERED_ENTITY: DiscoveredEntity = {
	type: "person",
	value: "Gen. Sarah Kim",
	confidence: 0.9,
	signalRelevance: 85,
};

describe("buildDiscoveredEntityRow", () => {
	it("should map a discovered entity to a database row", () => {
		const row = buildDiscoveredEntityRow("signal-123", DISCOVERED_ENTITY);

		expect(row.signalId).toBe("signal-123");
		expect(row.type).toBe("person");
		expect(row.value).toBe("Gen. Sarah Kim");
		expect(row.confidence).toBe(0.9);
		expect(row.signalRelevance).toBe(85);
		expect(row.status).toBe("pending");
		expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("should handle agency type", () => {
		const entity: DiscoveredEntity = {
			type: "agency",
			value: "Space Force Delta 6",
			confidence: 0.85,
			signalRelevance: 90,
		};

		const row = buildDiscoveredEntityRow("signal-456", entity);

		expect(row.type).toBe("agency");
		expect(row.value).toBe("Space Force Delta 6");
		expect(row.signalRelevance).toBe(90);
	});

	it("should always set status to pending", () => {
		const row = buildDiscoveredEntityRow("signal-123", DISCOVERED_ENTITY);
		expect(row.status).toBe("pending");
	});
});
