# Branch Protection Rules

This repository enforces trunk-based development practices through branch protection rules on the `main` branch.

## Protected Branch

- **`main`** - The primary branch that requires all changes to go through pull requests

## Protection Rules

The following rules are enforced on the `main` branch:

### Pull Request Requirements
- ✅ **Require pull request reviews** - At least 1 approval is required before merging
- ✅ **Dismiss stale reviews** - Stale reviews are automatically dismissed when new commits are pushed
- ✅ **Require conversation resolution** - All comments and review threads must be resolved before merging

### Merge Requirements
- ✅ **Require status checks to pass** - All CI/CD checks must pass before merging
- ✅ **Require branches to be up to date** - Branch must be up to date with the base branch before merging
- ✅ **Require linear history** - Only squash merge or rebase merge is allowed (no merge commits)

### Branch Safety
- ✅ **Prevent force pushes** - Force pushes to the protected branch are not allowed
- ✅ **Prevent branch deletion** - The protected branch cannot be deleted
- ✅ **Enforce rules for administrators** - Protection rules apply to all users, including administrators

## Setting Up Branch Protection

Branch protection rules can be configured automatically using the GitHub Actions workflow:

1. Go to **Actions** tab in your GitHub repository
2. Select **Setup Branch Protection** workflow
3. Click **Run workflow**
4. Optionally specify a branch name (defaults to `main`)
5. Click **Run workflow** button

The workflow will configure all protection rules automatically.

### Manual Setup

If you prefer to set up branch protection manually:

1. Go to **Settings** → **Branches** in your GitHub repository
2. Click **Add rule** or edit the existing rule for `main`
3. Configure the following settings:
   - ✅ Require a pull request before merging
     - Require approvals: 1
     - Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require status checks to pass before merging
   - ✅ Require conversation resolution before merging
   - ✅ Require linear history
   - ✅ Include administrators
   - ✅ Restrict who can push to matching branches (optional)
   - ✅ Do not allow force pushes
   - ✅ Do not allow deletions

## Working with Trunk-Based Development

### Creating a Feature Branch

```bash
# Create and switch to a new feature branch
git checkout -b feature/your-feature-name

# Make your changes and commit
git add .
git commit -m "Add your feature"

# Push to remote
git push origin feature/your-feature-name
```

### Creating a Pull Request

1. Push your feature branch to the remote repository
2. Go to the GitHub repository and click **New Pull Request**
3. Select your feature branch to merge into `main`
4. Fill in the PR description and request reviewers
5. Wait for:
   - ✅ At least 1 approval
   - ✅ All CI/CD checks to pass
   - ✅ All conversations to be resolved
6. Merge using **Squash and merge** or **Rebase and merge** (merge commits are not allowed)

### Keeping Your Branch Up to Date

Before merging, ensure your branch is up to date with `main`:

```bash
# Fetch latest changes
git fetch origin

# Rebase your branch on top of main
git checkout feature/your-feature-name
git rebase origin/main

# If there are conflicts, resolve them and continue
git rebase --continue

# Force push (only to your feature branch, not main)
git push origin feature/your-feature-name --force-with-lease
```

## Troubleshooting

### "Branch is out of date" Error

If you see this error when trying to merge:
1. Update your branch with the latest changes from `main`
2. Resolve any merge conflicts
3. Push the updated branch
4. The PR will automatically update

### "Required status check is waiting" Error

If CI/CD checks are not running:
1. Ensure your PR has been opened and is targeting `main`
2. Check the **Checks** tab in your PR to see which checks are pending
3. If checks are not triggering, verify that your CI/CD workflows are properly configured

### "Conversation must be resolved" Error

If you see this error:
1. Go to your PR and check the **Conversation** tab
2. Resolve any unresolved review comments or threads
3. Once all conversations are resolved, you can merge

## Permissions

To run the setup workflow, you need:
- Repository admin access

The workflow uses `GITHUB_TOKEN` by default. However, setting branch protection rules via API requires admin permissions.

**Note:** If the workflow fails due to insufficient permissions, you have two options:

1. **Use a Personal Access Token (PAT)** with `repo` and `admin:repo` permissions:
   - Create a PAT with admin access at: https://github.com/settings/tokens
   - Add it as a repository secret named `ADMIN_TOKEN`
   - Update the workflow to use `secrets.ADMIN_TOKEN` instead of `secrets.GITHUB_TOKEN`

2. **Set up branch protection manually** using the GitHub UI (see Manual Setup section above)

The workflow requests `administration: write` permission, but GitHub may restrict this for security reasons. In such cases, a PAT with explicit admin permissions is required.
