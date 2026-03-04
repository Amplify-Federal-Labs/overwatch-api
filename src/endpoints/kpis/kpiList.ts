import { contentJson, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { KpiSchema } from "../../schemas";
import { mockKPIs } from "../../data/mock-kpis";
import type { AppContext } from "../../types";

export class KpiList extends OpenAPIRoute {
	schema = {
		tags: ["KPIs"],
		summary: "List all KPI metrics",
		operationId: "kpi-list",
		responses: {
			"200": {
				description: "Array of KPI metrics",
				...contentJson(z.object({
					success: z.boolean(),
					result: z.array(KpiSchema),
				})),
			},
		},
	};

	async handle(_c: AppContext) {
		return { success: true, result: mockKPIs };
	}
}
