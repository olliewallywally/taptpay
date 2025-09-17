# ESLint and Prettier Setup

This project has been configured with ESLint and Prettier to catch JSX syntax errors early and ensure consistent code formatting.

## Configuration Files

- `eslint.config.js` - ESLint v9 configuration with React/TypeScript rules
- `.prettierrc` - Prettier formatting configuration

## Manual Commands

Since package.json editing is restricted, use these npx commands directly:

### Linting Commands

```bash
# Check for linting issues
npx eslint . --ext .ts,.tsx,.js,.jsx --report-unused-disable-directives --max-warnings 0

# Auto-fix linting issues
npx eslint . --ext .ts,.tsx,.js,.jsx --fix

# Lint specific file
npx eslint client/src/components/SomeComponent.tsx

# Lint specific directory
npx eslint client/src/pages/ --ext .ts,.tsx
```

### Formatting Commands

```bash
# Check formatting issues
npx prettier --check .

# Auto-fix formatting issues
npx prettier --write .

# Format specific file
npx prettier --write client/src/components/SomeComponent.tsx

# Format specific directory
npx prettier --write client/src/pages/
```

### Combined Commands

```bash
# Check both linting and formatting
npx eslint . --ext .ts,.tsx,.js,.jsx && npx prettier --check .

# Fix both linting and formatting
npx eslint . --ext .ts,.tsx,.js,.jsx --fix && npx prettier --write .
```

## Key ESLint Rules for JSX Error Detection

The configuration includes these important rules to catch JSX syntax errors:

- `react/jsx-no-comment-textnodes` - Prevents accidental JSX comment syntax errors
- `react/jsx-no-useless-fragment` - Catches unnecessary React fragments
- `react/self-closing-comp` - Enforces proper self-closing component syntax
- `react/jsx-closing-bracket-location` - Ensures proper JSX bracket placement
- `react/jsx-closing-tag-location` - Validates closing tag placement
- `react/jsx-tag-spacing` - Enforces proper spacing in JSX tags
- `react/jsx-wrap-multilines` - Requires parentheses around multiline JSX

## IDE Integration

Most IDEs will automatically detect these configuration files and provide:
- Real-time error highlighting
- Auto-formatting on save
- Inline error messages

## Running Before Commits

Always run linting and formatting before committing:

```bash
npx eslint . --ext .ts,.tsx,.js,.jsx --fix && npx prettier --write .
```

This ensures code quality and prevents JSX syntax errors from breaking the application.