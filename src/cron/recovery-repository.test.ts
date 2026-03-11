import { describe, it, expect, vi } from "vitest";
import { RecoveryRepository } from "./recovery-repository";

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

	describe("countUnsynthesizedProfiles", () => {
		it("returns count of profiles that have observations but no synthesis", async () => {
			const db = {
				prepare: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({ count: 3 }),
				}),
			} as unknown as D1Database;

			const repo = new RecoveryRepository(db);
			const count = await repo.countUnsynthesizedProfiles();
			expect(count).toBe(3);
		});

		it("returns 0 when all profiles are synthesized", async () => {
			const db = {
				prepare: vi.fn().mockReturnValue({
					first: vi.fn().mockResolvedValue({ count: 0 }),
				}),
			} as unknown as D1Database;

			const repo = new RecoveryRepository(db);
			const count = await repo.countUnsynthesizedProfiles();
			expect(count).toBe(0);
		});
	});

	describe("countPendingEnrichments", () => {
		it("returns count of enrichable profiles with pending status", async () => {
			const db = {
				prepare: vi.fn().mockReturnValue({
					bind: vi.fn().mockReturnValue({
						first: vi.fn().mockResolvedValue({ count: 4 }),
					}),
				}),
			} as unknown as D1Database;

			const repo = new RecoveryRepository(db);
			const count = await repo.countPendingEnrichments();
			expect(count).toBe(4);
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
			const db = {
				prepare: vi.fn().mockImplementation((sql: string) => {
					if (sql.includes("observation_entities")) {
						return { first: vi.fn().mockResolvedValue({ count: 2 }) };
					}
					if (sql.includes("last_synthesized_at")) {
						return { first: vi.fn().mockResolvedValue({ count: 1 }) };
					}
					if (sql.includes("enrichment_status")) {
						return {
							bind: vi.fn().mockReturnValue({
								first: vi.fn().mockResolvedValue({ count: 2 }),
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
				unsynthesizedProfileCount: 1,
				pendingEnrichmentCount: 2,
				unmaterializedItemCount: 4,
			});
		});
	});
});
