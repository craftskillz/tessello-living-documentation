# The everyday commands of this Module. `just` alone lists them.

default:
    @just --list

# Unit tests (Node, a few seconds)
test:
    npm test

# Browser tests of the View and the Widget against the Test Host of the SDK (builds dist/ first)
e2e:
    npm run test:browser

# Type checking
typecheck:
    npm run typecheck

# Builds the package into dist/ and validates it
build:
    npm run build
    npx tessello validate dist

# Publishes a new version and lists it on the Marketplace: `just publish minor` (or major, patch, fix). See README.md
publish bump:
    npx tessello release {{ bump }}

# Lists the version of manifest.json on the Marketplace, once its package is online: `just marketplace [--dry-run]`
marketplace *options:
    npx tessello publish {{ options }}
