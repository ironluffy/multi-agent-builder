<!--
SYNC IMPACT REPORT
Version: 1.0.0 (initial constitution)
Ratified: 2025-11-21
Changes from template:
  - Adapted all 7 core principles to multi-agent builder and spec-driven development domain
  - Added agent-specific guidance to Code Quality, Testing Standards, and Collaboration
  - Customized Development Workflow to match SPARC methodology
  - Added Quality Gates specific to spec-driven workflow
  - Customized Decision-Making Framework for multi-agent coordination

Templates requiring updates:
  ✅ plan-template.md - Constitution Check section aligned
  ✅ spec-template.md - User stories and requirements structure aligned
  ✅ tasks-template.md - Task organization and testing standards aligned
  ✅ Command files - Generic agent guidance (no CLAUDE-specific references)

Follow-up TODOs: None
-->

# Project Constitution: Multi-Agent Builder

**Ratified**: 2025-11-21
**Version**: 1.0.0
**Scope**: All features, specifications, and implementations

This constitution establishes the core principles and standards that govern development
in the Multi-Agent Builder project. All features MUST comply with these principles,
and any deviations require explicit justification in the plan.md file.

## Core Principles

### 1. Code Quality

**Rules**:
- Write clean, readable, and maintainable code that follows established conventions
- Prioritize clarity over cleverness; code should be self-documenting
- Follow language-specific style guides (e.g., PEP 8 for Python, Airbnb for JavaScript)
- Keep functions focused and under 50 lines when possible
- Use meaningful variable and function names that convey intent
- Avoid deep nesting (max 3 levels) and complex conditionals

**Rationale**: Clean code reduces cognitive load, accelerates onboarding, and minimizes
bugs. In a multi-agent system where different agents may work on the same codebase,
code clarity is essential for coordination and handoffs.

### 2. Testing Standards

**Rules**:
- All new features MUST include tests unless explicitly justified in plan.md
- Aim for >80% code coverage across the codebase
- Write tests that document expected behavior and serve as living documentation
- Test edge cases, error conditions, and boundary values
- Use Test-Driven Development (TDD) when specified: write failing tests first
- Organize tests by type: unit, integration, and contract tests
- Tests MUST be independently runnable and not depend on execution order

**Rationale**: Tests are the safety net that enables confident refactoring and rapid
iteration. In spec-driven development, tests validate that implementations match
specifications. TDD ensures that requirements are understood before implementation begins.

### 3. User Experience

**Rules**:
- Design with the end user in mind; validate assumptions with user scenarios
- Ensure consistency across the application (UI, API responses, error messages)
- Provide clear, actionable error messages that guide users to solutions
- Make interfaces intuitive and accessible (follow WCAG 2.1 guidelines where applicable)
- Validate user input at system boundaries and provide immediate feedback
- Document user-facing features with examples and quickstart guides

**Rationale**: User experience drives adoption and reduces support burden. Clear feedback
and intuitive design minimize friction and enable users to accomplish their goals efficiently.

### 4. Performance Requirements

**Rules**:
- Optimize for common use cases; profile before optimizing rare paths
- Profile performance before and after optimizations to measure impact
- Document performance-critical sections and their complexity
- Balance performance with maintainability; avoid premature optimization
- Set performance targets in plan.md (e.g., response time, throughput)
- Monitor and log performance metrics in production

**Rationale**: Performance impacts user satisfaction and system scalability. However,
premature optimization adds complexity and reduces maintainability. Profiling ensures
that optimization efforts target actual bottlenecks.

### 5. Documentation

**Rules**:
- Document public APIs and interfaces with parameter types and examples
- Include examples in documentation that users can copy and run
- Keep README.md up-to-date with setup, usage, and contribution guidelines
- Document architectural decisions in plan.md and research.md
- Use inline comments sparingly; prefer self-documenting code
- Maintain specification documents (spec.md, plan.md, tasks.md) for all features

**Rationale**: Documentation is the bridge between code and understanding. Good documentation
reduces onboarding time, prevents knowledge silos, and enables effective collaboration
across teams and agents.

### 6. Security

**Rules**:
- Validate all user inputs at system boundaries
- Follow security best practices (OWASP Top 10, principle of least privilege)
- Keep dependencies up-to-date; scan for known vulnerabilities regularly
- Review code for security vulnerabilities before merging
- Never hardcode secrets; use environment variables or secure vaults
- Sanitize outputs to prevent injection attacks (SQL, XSS, command injection)
- Log security events for auditing and incident response

**Rationale**: Security breaches have severe consequences for users and the organization.
Proactive security measures prevent vulnerabilities from reaching production and protect
user data and system integrity.

### 7. Collaboration

**Rules**:
- Write descriptive commit messages following conventional commits format
- Review code carefully and constructively; focus on improvement, not criticism
- Communicate decisions and trade-offs in plan.md and code comments
- Share knowledge with the team through documentation and pair programming
- Use branches for features; merge to main only after review and testing
- Respond to review feedback promptly and professionally
- In multi-agent workflows, coordinate via memory and hooks as specified

**Rationale**: Effective collaboration accelerates development and improves code quality.
Clear communication prevents misunderstandings and duplicated effort. In multi-agent
systems, coordination mechanisms (memory, hooks) enable agents to work in parallel
without conflicts.

## Development Workflow

The Multi-Agent Builder follows a **spec-driven SPARC methodology**:

1. **Specification** (`/spec-mix.specify`): Define what needs to be built
   - Create spec.md with user stories, requirements, and success criteria
   - Prioritize user stories (P1, P2, P3...) for incremental delivery
   - Ensure each user story is independently testable

2. **Planning** (`/spec-mix.plan`): Create technical implementation plan
   - Generate plan.md with architecture, technical context, and structure
   - Conduct research (research.md) and define data models (data-model.md)
   - Create contracts for APIs and interfaces
   - Pass Constitution Check before proceeding

3. **Implementation** (`/spec-mix.tasks`, `/spec-mix.implement`): Build with tests
   - Generate tasks.md with dependency-ordered work packages
   - Implement foundational infrastructure first (blocks all user stories)
   - Implement user stories in priority order (P1 → P2 → P3)
   - Write tests first if TDD specified; ensure tests fail before implementation

4. **Review** (`/spec-mix.review`, `/spec-mix.review-interactive`): Peer review code and tests
   - Review code in for_review lane; provide constructive feedback
   - Validate that implementation matches specification
   - Check test coverage and quality
   - Move approved tasks to done lane

5. **Acceptance** (`/spec-mix.accept`): Verify feature readiness
   - Run all tests and ensure they pass
   - Validate against success criteria from spec.md
   - Generate acceptance.md report
   - Prepare feature for merge

6. **Integration** (`/spec-mix.merge`): Merge to main branch
   - Merge feature branch to main
   - Clean up worktrees and temporary files
   - Update project documentation

## Quality Gates

Before merging to main, the following gates MUST pass:

- [ ] All tests passing (unit, integration, contract as applicable)
- [ ] Code reviewed and approved (via `/spec-mix.review`)
- [ ] Documentation updated (README, API docs, spec artifacts)
- [ ] No known critical bugs (P0/P1 issues resolved)
- [ ] Performance requirements met (as defined in plan.md)
- [ ] Constitution Check passed (no unjustified violations)
- [ ] Acceptance report generated (`/spec-mix.accept`)

**Exemptions**: If a gate cannot be satisfied, document the reason and mitigation plan
in acceptance.md. Exemptions require explicit approval from project maintainers.

## Constitution Check

The Constitution Check is performed during the planning phase (`/spec-mix.plan`) and
validates that the proposed design complies with these principles. Common violations:

- **Complexity**: Introducing unnecessary abstractions, patterns, or projects
- **Testing**: Skipping tests without justification
- **Documentation**: Missing API documentation or examples
- **Performance**: No performance targets for performance-critical features
- **Security**: Missing input validation or security review

**Handling Violations**: If a violation is necessary, document it in the "Complexity
Tracking" section of plan.md with:
1. What principle is violated
2. Why the violation is needed
3. What simpler alternative was rejected and why

## Decision-Making Framework

When faced with technical choices, evaluate in this order:

1. **User impact**: How does this choice affect end users?
   - Consider usability, performance, and reliability
   - Prioritize user value over technical elegance

2. **Maintainability**: Can the team understand and modify this in 6 months?
   - Favor simplicity and clarity
   - Avoid over-engineering and premature abstraction

3. **Performance implications**: What are the performance trade-offs?
   - Profile before optimizing
   - Set measurable targets and validate against them

4. **Security considerations**: Does this introduce security risks?
   - Follow OWASP guidelines and security best practices
   - Validate inputs, sanitize outputs, minimize attack surface

5. **Documentation**: Document the decision and rationale
   - Record in plan.md or architecture decision records (ADRs)
   - Explain trade-offs and alternatives considered

**Ties**: If options are equivalent, prefer the simpler option that requires less code,
fewer dependencies, and less cognitive load.

## Governance

### Amendment Procedure

This constitution can be amended to reflect evolving project needs. To propose an amendment:

1. Create an issue describing the proposed change and rationale
2. Discuss with project maintainers and stakeholders
3. Update specs/constitution.md via pull request
4. Increment version according to semantic versioning (see below)
5. Update dependent templates and command files to maintain consistency
6. Generate Sync Impact Report as HTML comment in constitution.md

### Versioning Policy

Constitution versions follow semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR**: Backward-incompatible changes (principle removed, governance redefined)
- **MINOR**: New principle added or materially expanded guidance
- **PATCH**: Clarifications, wording fixes, non-semantic refinements

### Compliance Review

Project maintainers will review compliance with this constitution during:
- Planning phase (Constitution Check in `/spec-mix.plan`)
- Code review (via `/spec-mix.review`)
- Acceptance phase (via `/spec-mix.accept`)

Non-compliance without justification will block feature acceptance.

### Retrospectives

After major milestones, conduct retrospectives to evaluate:
- Are principles being followed in practice?
- Do principles need clarification or amendment?
- Are quality gates effective?
- What improvements can be made to the workflow?

Use retrospective insights to refine this constitution and improve the development process.

---

**End of Constitution** | Version 1.0.0 | Ratified 2025-11-21
