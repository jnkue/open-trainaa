# Contributing

Hello and thank you for your interest in contributing to TRAINAA! 

We welcome contributions from the community to help us build the best endurance training app possible.
If you need any help or want to discuss ideas, feel free to join our [Discord community](https://discord.gg/ehMPJErVRN) or take a look at the github discussions and issues.

If you need help to setup the project read the Quickstart in the [Welcome Guide](../Welcome.md) to setup the project.


  
## Branching Strategy

We use **GitHub Flow with a staging gate**:

```
feature-branch ──> PR to main ──> merge ──> auto-deploy staging
                                                      │
                                            validate & QA
                                                      │
                                  PR to production ──> auto-deploy prod
```

1. Create a fork and branch off `main` for your feature or bugfix
2. Open a PR to `main` -- CI runs lint + tests automatically
3. After review and merge, changes auto-deploy to the staging environment


### Linting and testing

Before opening a PR, make sure to run linting and tests locally:

=== "Frontend"

  ```bash
  cd src/app
  bun run lint  
  ```

=== "Backend"

  ```bash
  ./dev.sh lint      # Lint with ruff
  ./dev.sh format    # Auto-format with ruff
  ```

#### Testing 
TODO !!

## Version Management

!!! tip "Versioning and Changelog"
    You do not need to worry about versioning or updating the changelog when contributing. Just focus on making your changes and opening a PR. We will take care of versioning and changelog updates during our regular release process.


At least every week before the release, we will bump the version number in `version.config.json` and update the unreleased items in the `CHANGELOG.md` file to the new version. This helps us keep track of changes and communicate them effectively to users.


All version strings across the repo are managed from a single source of truth: `version.config.json` at the repository root.

```json
{
  "appVersion": "1.0.3",
  "minSupportedVersion": "1.0.0"
}
```

### Bumping the version

Use the bump script to update all version references at once:

```bash
# Bump the app version
./dev.sh bump 1.0.4

# Bump the app version and update the minimum supported version
./dev.sh bump 1.0.4 --min-supported 1.0.1
```


!!! warning "Do not edit version strings manually"
    Always use `./dev.sh bump` to keep all version references in sync.
    The files `src/backend/api/version.py` and `src/app/constants/version.ts` are managed by the bump script.


### Change Log

We maintain a `CHANGELOG.md` file to document all notable changes for each version. Please update the changelog.md file under the [Unreleased] section with a brief description of your changes when you open a PR. This helps us keep track of changes and communicate them effectively to users.

When a new version is released, we will move the changes from the [Unreleased] section to a new section with the version number and release date.




### License

By contributing, you agree that your contributions will be licensed under the AGPL License. For more information, see the LICENSE file in the repository.