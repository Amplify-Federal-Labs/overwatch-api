import { describe, it, expect, vi } from "vitest";
import { RecoveryRepository } from "./recovery-repository";

function mockDb(results: Record<string, unknown[]>) {
	return {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					all: vi.fn().mockResolvedValue(results.where ?? []),
				}),
				all: vi.fn().mockResolvedValue(results.all ?? []),
			}),
		}),
		run: vi.fn(),
	};
}

describe("RecoveryRepository", () => {
	describe("countUnresolvedEntities", () => {
		it("returns count of observation entities with null entity_profile_id", async () => {
			const db = {
				prepare: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({ count: 5 }),
				}),
			} as unknown as D1Database;

			const repo = new RecoveryRepository(db);
			const count = await repo.countUnresolvedEntities();
			expect(count).toBe(5);
		});

		it("returns 0 when no unresolved entities", async () => {
			const db = {
				prepare: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({ count: 0 }),
				}),
			} as unknown as D1Database;

			const repo = new RecoveryRepository(db);
			const count = await repo.countUnresolvedEntities();
			expect(count).toBe(0);
		});
	});

	describe("findUnsynthesizedProfileIds", () => {
		it("returns IDs of profiles that have observations but no synthesis", async () => {
			const db = {
				prepare: vi.fn().mockReturnValue({
					all: vi.fn().mockResolvedValue({
						results: [{ id: "p1" }, { id: "p2" }],
					}),
				}),
			} as unknown as D1Database;

			const repo = new RecoveryRepository(db);
			const ids = await repo.findUnsynthesizedProfileIds();
			expect(ids).toEqual(["p1", "p2"]);
		});

		it("returns empty array when all profiles are synthesized", async () => {
			const db = {
				prepare: vi.fn().mockReturnValue({
					all: vi.fn().mockResolvedValue({ results: [] }),
				}),
			} as unknown as D1Database;

			const repo = new RecoveryRepository(db);
			const ids = await repo.findUnsynthesizedProfileIds();
			expect(ids).toEqual([]);
		});
	});

	describe("findPendingEnrichmentIds", () => {
		it("returns IDs of enrichable profiles with pending status", async () => {
			const db = {
				prepare: vi.fn().mockReturnValue({
					bind: vi.fn().mockReturnValue({
						all: vi.fn().mockResolvedValue({
							results: [{ id: "p3" }, { id: "p4" }],
						}),
					}),
				}),
			} as unknown as D1Database;

			const repo = new RecoveryRepository(db);
			const ids = await repo.findPendingEnrichmentIds();
			expect(ids).toEqual(["p3", "p4"]);
		});
	});

	describe("countUnmaterializedItems", () => {
		it("returns count of ingested items with observations but no signal", async () => {
			const db = {
				prepare: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({ count: 3 }),
				}),
			} as unknown as D1Database;

			const repo = new RecoveryRepository(db);
			const count = await repo.countUnmaterializedItems();
			expect(count).toBe(3);
		});
	});

	describe("getPipelineStatus", () => {
		it("aggregates all status checks into PipelineStatus", async () => {
			const prepareResults = new Map<string, unknown>();

			const db = {
				prepare: vi.fn().mockImplementation((sql: string) => {
					if (sql.includes("observation_entities")) {
						return { first: vi.fn().mockResolvedValue({ count: 2 }) };
					}
					if (sql.includes("last_synthesized_at")) {
						return { all: vi.fn().mockResolvedValue({ results: [{ id: "p1" }] }) };
					}
					if (sql.includes("enrichment_status")) {
						return {
							bind: vi.fn().mockReturnValue({
								all: vi.fn().mockResolvedValue({ results: [{ id: "p2" }, { id: "p3" }] }),
							}),
						};
					}
					if (sql.includes("NOT IN")) {
						return { first: vi.fn().mockResolvedValue({ count: 4 }) };
					}
					return { first: vi.fn().mockResolvedValue({ count: 0 }) };
				}),
			} as unknown as D1Database;

			const repo = new RecoveryRepository(db);
			const status = await repo.getPipelineStatus();

			expect(status).toEqual({
				unresolvedEntityCount: 2,
				unsynthesizedProfileIds: ["p1"],
				pendingEnrichmentIds: ["p2", "p3"],
				unmaterializedItemCount: 4,
			});
		});
	});
});
