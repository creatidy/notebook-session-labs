# Release Process

## Versioning

This project uses [Changesets](https://github.com/changesets/changesets) for version management.

## Release Steps

1. Create a changeset: `pnpm changeset`
2. Commit the changeset with your changes
3. Run version: `pnpm changeset version`
4. Review the generated changelog entries
5. Commit the version bump
6. Run publish: `pnpm changeset publish`
7. Tag the release: `git tag v<version>`
8. Push: `git push --follow-tags`

## CI

The GitHub Actions workflow handles:
- Build verification on every push
- Automated release on main branch when changesets are present