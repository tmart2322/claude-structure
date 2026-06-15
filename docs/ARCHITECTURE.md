# Architecture

> Skeleton — fill in as the system takes shape. The entry review skims the *Risks & mitigations* section, so keep that current even if the rest lags. Don't let this become a second copy of facts that live elsewhere (schema → a database doc; commands → [`PROJECT.md`](PROJECT.md)); link instead.

## Overview

<One paragraph + a diagram if useful: the major components and how a request/job flows through them.>

## Components

| Component | Responsibility | Lives in |
|---|---|---|
| <…> | <…> | <dir> |

## Boundaries

> The lines that must not blur — what each component owns and what it must never reach into. These are often where a design tenet lives (e.g. "the core never imports a specific integration"). State them so a reviewer can check them.

- <boundary rule>

## Data model

<Link to the living schema reference if you have one, or sketch the key entities + relationships here. For each entity note its owner — see the data-ownership check in [`REVIEW.md`](REVIEW.md).>

## Risks & mitigations

> Re-skimmed at every phase entry review. Add a row when a phase introduces a new risk or makes an existing one materially worse.

| Risk | Severity | Mitigation |
|---|---|---|
| <…> | <H/M/L> | <…> |
