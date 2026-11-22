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
