import type { EmailDraft } from "../schemas";

export const mockEmailDrafts: EmailDraft[] = [
	{
		id: "draft-1",
		stakeholderId: "st4",
		signalId: "s1",
		subject: "Following up from AFCEA West — STIG automation for IL5 migration",
		body: `Dr. Torres,

Great connecting with you at AFCEA West last month. Our conversation about STIG automation challenges in your Kubernetes adoption program really resonated — it's exactly the problem space our team has been solving for other Navy programs.

I noticed NIWC PAC just published the RFI for the Next-Gen Cloud Platform Migration to IL5. Given your focus on container orchestration and STIG-automated deployment pipelines, I thought you might find our recent work relevant. We built a fully automated STIG compliance pipeline for Kubernetes workloads at IL5 that reduced ATO timelines by 60%.

Would you be open to a brief call to discuss how this might apply to your program? I'll also be at KubeCon NA in April if you'd prefer to connect in person at the Gov Track.

Best regards,
Sean Scanlon
Amplify Federal`,
		status: "draft",
		context: {
			stakeholderName: "Dr. Michael Torres",
			stakeholderTitle: "Program Manager",
			stakeholderOrg: "NIWC PAC",
			signalTitle: "NIWC PAC RFI: Next-Gen Cloud Platform Migration to IL5",
			referencedInteractions: ["int1"],
			playId: "classifiedai",
		},
		createdAt: "2026-03-03T08:00:00Z",
		updatedAt: "2026-03-03T08:00:00Z",
	},
	{
		id: "draft-2",
		stakeholderId: "st4",
		signalId: "s1",
		subject: "NIWC PAC IL5 RFI — Amplify's Kubernetes STIG automation capability",
		body: `Dr. Torres,

Following up on our conversation at AFCEA West about the challenges your team faces with STIG compliance in containerized environments.

With the NIWC PAC IL5 RFI now open, I wanted to share a quick overview of how we've tackled similar migrations. Our approach automates 90% of Kubernetes STIG controls at the pipeline level, which has been a game-changer for other Navy programs dealing with the same compliance bottleneck.

Happy to walk through the technical details if helpful — or if you'd prefer, I can send over a brief case study.

Best,
Sean Scanlon
Amplify Federal`,
		status: "draft",
		context: {
			stakeholderName: "Dr. Michael Torres",
			stakeholderTitle: "Program Manager",
			stakeholderOrg: "NIWC PAC",
			signalTitle: "NIWC PAC RFI: Next-Gen Cloud Platform Migration to IL5",
			referencedInteractions: ["int1"],
			playId: "classifiedai",
		},
		createdAt: "2026-03-03T09:00:00Z",
		updatedAt: "2026-03-03T09:00:00Z",
	},
	{
		id: "draft-3",
		stakeholderId: "st2",
		signalId: "s1",
		subject: "NIWC PAC IL5 Cloud Migration — Amplify Federal capabilities",
		body: `CAPT Walsh,

I'm reaching out regarding the NIWC PAC RFI for the Next-Gen Cloud Platform Migration to IL5. Amplify Federal has deep experience delivering IL5 Kubernetes platforms with automated STIG compliance for Navy programs.

Our team has built production IL5 environments with zero-trust architecture and STIG-automated deployment pipelines that reduced ATO timelines by 60%. We'd welcome the opportunity to discuss how our approach aligns with NIWC PAC's modernization goals.

Would you be open to a brief introductory call? I'll also be at the Navy League Sea-Air-Space conference in April if you'd prefer to connect in person.

Respectfully,
Sean Scanlon
Amplify Federal`,
		status: "draft",
		context: {
			stakeholderName: "CAPT Jennifer Walsh",
			stakeholderTitle: "Deputy Program Manager",
			stakeholderOrg: "NIWC PAC",
			signalTitle: "NIWC PAC RFI: Next-Gen Cloud Platform Migration to IL5",
			referencedInteractions: [],
			playId: "classifiedai",
		},
		createdAt: "2026-03-03T10:00:00Z",
		updatedAt: "2026-03-03T10:00:00Z",
	},
	{
		id: "draft-4",
		stakeholderId: "st1",
		signalId: "s2",
		subject: "645th DevSecOps Modernization — Amplify's software factory experience",
		body: `Col. Park,

I noticed the 645th AESG sources sought for CI/CD pipeline modernization across your software factories. This is exactly the work Amplify Federal specializes in — we've delivered DevSecOps pipeline migrations for other Air Force programs, moving from legacy GitLab setups to fully containerized architectures with STIG automation and ATO acceleration.

Our team embeds directly with government software factories rather than advising from the outside. We've consistently delivered modernization ahead of schedule and under cost.

I'd welcome the chance to discuss how our approach might support the 645th's modernization goals. I'll be at AFCEA TechNet Air in April — would that be a good venue to connect?

Best regards,
Sean Scanlon
Amplify Federal`,
		status: "draft",
		context: {
			stakeholderName: "Col. David Park",
			stakeholderTitle: "Program Director",
			stakeholderOrg: "645th AESG",
			signalTitle: "USAF 645th — DevSecOps Pipeline Modernization (Sources Sought)",
			referencedInteractions: [],
			playId: "modernization",
		},
		createdAt: "2026-03-03T10:30:00Z",
		updatedAt: "2026-03-03T10:30:00Z",
	},
];
