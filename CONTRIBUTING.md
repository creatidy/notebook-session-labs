# Contributing to Notebook Session Labs

Thank you for your interest in contributing. This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/notebook-session-labs.git`
3. Install dependencies: `pnpm install`
4. Create a feature branch: `git checkout -b feature/your-feature`

## Development

```bash
pnpm build       # Build all packages
pnpm test        # Run tests
pnpm lint        # Lint code
pnpm typecheck   # Type check
```

## Pull Request Process

1. Ensure tests pass: `pnpm test`
2. Ensure lint passes: `pnpm lint`
3. Update documentation if needed
4. Add a changeset: `pnpm changeset`
5. Submit the PR against the `main` branch

## Code Style

- TypeScript strict mode
- ESLint + Prettier formatting
- Clear, descriptive commit messages
- Small, focused PRs preferred

## Reporting Issues

- Use the GitHub issue templates
- Include reproduction steps
- Include relevant environment details

## License

By contributing, you agree that your contributions will be licensed under the MIT License.