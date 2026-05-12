# Tulzo Project Reflection

## Introduction

Tulzo began as a practical web project built around free online tools, but it gradually evolved into a larger AI platform focused on integration, composition, and automation. The goal was not only to provide useful browser-based utilities for health, money, time, and decision-making, but also to create an environment where users could connect external systems, bring their own tools, and build reusable AI workflows.

The central idea behind Tulzo was accessibility. Many AI products are expensive, locked into one provider, or difficult to extend. This project took a different approach: use cheaper models where possible, support multiple providers, expose tools through MCP, represent workflows through YAML and Mermaid, and allow users to import their own APIs, agents, and knowledge bases.

## Project Description

At the product level, Tulzo combines three ideas. First, it offers free browser-based utilities that work instantly without requiring accounts. Second, it provides an AI layer where authenticated users can chat with models, attach tools, use RAG knowledge bases, and manage token budgets. Third, it acts as a composition platform where users can import REST APIs, GraphQL endpoints, MCP servers, A2A agents, and RAG sources, then turn them into reusable tools and automations.

Two of the most important features are the MCP Composer and the automation builder. The MCP Composer allows users to create focused MCP servers from selected tools instead of exposing one large tool catalog. This improves AI performance because fewer tools mean less confusion and better task matching. The automation system extends this further by allowing users to define YAML-based workflows that can be triggered manually, by webhook, or on a schedule. These workflows can call tools, branch conditionally, loop, use AI steps, pause for human approval, and send outputs through email, push, or webhook. Together, these features support a marketplace-like direction in which users can bring, package, reuse, and eventually share their own tools.

## Architecture

The project follows a layered web-platform architecture. On the front end, Tulzo uses Next.js, React, and TypeScript. The App Router provides the application shell and routing, while the main pages are implemented as modular views and reusable components.

The application and integration layer lives in the API routes and shared libraries. The platform contains import pipelines for Swagger/OpenAPI, GraphQL, MCP, A2A, and RAG. Each imported resource is normalized into internal data structures so it can later be exposed as a callable tool. The MCP layer is especially important because it acts as a bridge between Tulzo and external AI assistants such as ChatGPT, Claude, or Cursor. Internal and external tools can be aggregated, exposed through MCP-compatible routes, and then consumed by chat or automation logic.

The data and infrastructure layer is built around Clerk, Supabase, and Upstash Vector. Clerk handles authentication and identity. Supabase stores platform state such as user settings, imported servers, automations, conversations, API keys, and execution logs. Upstash Vector supports the RAG subsystem by storing embeddings and enabling retrieval over uploaded or external knowledge bases. The Vercel AI SDK connects model calls and tool use, while model metadata and usage budgets are tracked in a cost-aware way.

## Development Paradigm

The main paradigm used in this project was architecture-driven development. The system was not built by adding isolated features without structure. Instead, development was guided by the larger question of what kind of platform Tulzo should become and which abstractions were needed so the system could keep growing without turning into duplication or chaos. This led to shared utilities, reusable schemas, route-based services, and normalization patterns for tools and imports.

At the same time, the project also followed modular component-based development. This was necessary because the platform includes many distinct but related capabilities: calculators, dashboards, model settings, RAG explorers, workflow builders, imports, and MCP tooling. A modular approach made the code more maintainable and extensible.

Another important paradigm was AI-assisted iterative development. AI was used as a development partner to accelerate drafting, debugging, refactoring, and experimentation, but the process remained human-led. The key architectural decisions and product trade-offs still required deliberate human judgment. In addition, the platform itself reflects a human-in-the-loop mindset, especially in workflow execution where automations can pause for approvals or missing input.

Finally, the project reflects cost-aware platform engineering. One of the design goals was to make AI practical by preferring cheaper and faster models where appropriate, supporting local embeddings, and tracking usage through explicit budget logic. This was important because AI products often become unsustainable when operating costs are ignored.

## Learnings and Journey

The most important learning from this project was that building AI products is less about attaching a model to a UI and more about designing reliable systems around that model. In practice, the real value came from the surrounding architecture: tool definitions, auth flows, workflow execution, data persistence, retrieval, logging, and cost controls. The intelligence layer only becomes useful when the rest of the system is structured.

Another major learning was the importance of scope and focus in tool-based AI systems. It may seem attractive to expose every possible tool to the model at once, but that quickly leads to confusion and weaker performance. This is why the MCP Composer became such an important part of the project. Better AI systems are often built from smaller, focused environments rather than one giant universal interface.

The project also showed that openness and flexibility always increase complexity. Supporting imports from REST, GraphQL, MCP, A2A, and RAG makes the platform far more powerful, but it also introduces challenges in authentication, schema handling, validation, error reporting, and user experience. The journey was therefore not only about adding features, but about repeatedly reshaping the architecture so these features could coexist coherently.

From a personal perspective, the project reinforced the value of combining experimentation with discipline. AI made it possible to move faster, prototype more aggressively, and test ideas with less friction. At the same time, speed alone was not enough. As the project grew, clear boundaries, reusable abstractions, and system thinking became increasingly important. The journey was a shift from feature construction toward platform thinking.

## Conclusion

Tulzo is best understood as an extensible AI workflow and tool platform rather than only a collection of utilities. Its architecture combines a modern React and Next.js interface, API-driven services, MCP-based tool aggregation, YAML workflow execution, retrieval through vector search, and budget-aware AI usage across multiple models. The project was shaped by architecture-driven development, modular design, AI-assisted iteration, and cost-conscious engineering. The most valuable outcome was not only the software itself, but the understanding that successful AI products depend on strong systems design, thoughtful composition, and clear human direction throughout the build process.
