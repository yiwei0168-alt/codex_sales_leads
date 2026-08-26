# Post-audit corrective rubric

Status: **rule 1 confirmed on 2026-08-26; later corrective rules remain under sequential user review**

The v1.2 human audit failed the frozen calibration thresholds, so the published scores remain provisional and no provider winner is declared. This document records corrective rules for the required future full-pool rescoring. It does not retroactively change the frozen v1.2 prompts, packets, decisions or raw scores.

## Corrective rule 1 — active-networking relevance

The original wording allowed generic IT adjacency to pass the `networkingRelevant` eligibility gate. The corrected gate requires explicit supplied evidence that the company sells, distributes, specifies, buys, designs, installs, deploys, operates or maintains active networking hardware, or implements a WLAN/LAN project that directly requires it.

Active networking includes routers and gateways, 4G/5G CPE, wireless APs, mesh and WLAN controllers, Ethernet/PoE switches, modems, outdoor and point-to-point wireless, network firewalls, security gateways and network-management controllers. A candidate can pass through an official product/catalog/listing, explicit distribution or resale, explicit design/specification/BOM/procurement/deployment/maintenance responsibility, a named relevant vendor relationship, or a concrete relevant project.

The following language is insufficient by itself: IT infrastructure, cloud connectivity, edge infrastructure, digital transformation, managed IT, IP solutions, system integration, network consulting, data center, broadcast IP and IT procurement. Pure structured cabling, copper, fiber or low-voltage work can establish an Installer role but does not pass the Cudy relevance gate without evidence involving active equipment.

The gate and the 45-point product/use-case fit dimension remain separate. A company materially involved in enterprise-only active networking can pass the gate while receiving a low Cudy-fit level. Missing public proof is recorded as `not demonstrated`, not as a factual assertion that the company is unrelated; `not demonstrated` nevertheless fails this benchmark gate.

## Executable enforcement

The shared `active-networking-relevance-v1` policy is now sent to the benchmark evaluator and the production qualification agent. Both pipelines independently recompute the gate from supplied evidence and can only preserve a model `true` when at least one explicit active-networking signal is present. Generic and passive-cabling examples are covered by automated tests in English and German.

The machine-readable next-iteration amendment is [`../config/corrective-rubric-v1.3.json`](../config/corrective-rubric-v1.3.json). The frozen v1.2 input manifest and result artifacts remain unchanged for reproducibility.
