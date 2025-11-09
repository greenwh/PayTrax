# Git Workflow Guide: Pulling and Merging Claude's Changes

This guide will walk you through pulling the changes from the remote repository, testing them locally, and merging them into your main branch.

## Current Branch
The latest changes are in branch: `claude/hour-entry-bank-register-updates-011CUrNu1RqKzNxYdoTEkMKG`

---

## Step 1: Navigate to Your Local Repository

Open your terminal (Command Prompt on Windows, Terminal on Mac/Linux) and navigate to your PayTrax directory:

```bash
cd /path/to/PayTrax
```

Replace `/path/to/PayTrax` with the actual path where your PayTrax repository is located.

**Example on Windows:**
```bash
cd C:\Users\YourName\Documents\PayTrax
```

**Example on Mac/Linux:**
```bash
cd ~/Documents/PayTrax
```

---

## Step 2: Check Your Current Status

Before pulling changes, let's see where you are:

```bash
git status
```

This shows:
- What branch you're on
- Any uncommitted changes

If you have uncommitted changes, either commit them or stash them:

```bash
# Option A: Commit your changes
git add .
git commit -m "Your commit message"

# Option B: Temporarily stash your changes
git stash
```

---

## Step 3: Fetch All Remote Branches

Pull the latest information from GitHub without changing your local files:

```bash
git fetch origin
```

This downloads information about all branches from GitHub, including the new Claude branch.

---

## Step 4: Switch to the Claude Branch

Now switch to the branch with the new features:

```bash
git checkout claude/hour-entry-bank-register-updates-011CUrNu1RqKzNxYdoTEkMKG
```

You should see a message like:
```
Branch 'claude/hour-entry-bank-register-updates-011CUrNu1RqKzNxYdoTEkMKG' set up to track remote branch...
Switched to a new local branch 'claude/hour-entry-bank-register-updates-011CUrNu1RqKzNxYdoTEkMKG'
```

---

## Step 5: Test the Application

PayTrax is a client-side application with **no dependencies to install**. Just start a local web server:

### Option A: Using Python (Recommended)

**Python 3:**
```bash
python -m http.server 8000
```

**Python 2:**
```bash
python -m SimpleHTTPServer 8000
```

### Option B: Using Windows Batch Script

If you're on Windows, you can use the included script:
```bash
start_paytrax_server.bat
```

### Option C: Using Node.js (if installed)

```bash
npx http-server -p 8000
```

---

## Step 6: Access the Application

Open your web browser and go to:
```
http://localhost:8000
```

---

## Step 7: Test the New Features

Test these new features:

### 1. **Hour Entry Improvements**
   - Go to Dashboard tab
   - Check that hour entry labels are shorter (no "Hours" suffix)
   - Verify input boxes are more compact

### 2. **Bank Register In-Line Editing**
   - Go to Banking tab
   - Click "Edit" button on any transaction
   - Modify date, description, type, or amount
   - Click "Save" to confirm or "Cancel" to discard

### 3. **CSV Import**
   - Go to Banking tab
   - Find the "Import CSV" section
   - Click "Choose File" and select a bank CSV export
   - Click "Sync Only" (adds new only) or "Import & Auto-Reconcile" (adds and reconciles)
   - Verify transactions are imported correctly
   - Supports 3 formats:
     - Format 1: Account,Date,Pending?,Description,Category,Check,Credit,Debit
     - Format 2: Date,Description,Original Description,Category,Amount,Status
     - Format 3: Account Number,Post Date,Check,Description,Debit,Credit

### 4. **Fuzzy Matching**
   - Try importing the same CSV twice
   - Verify duplicates are detected (±2 days, ±$1 tolerance)
   - Should skip or reconcile matches, not create duplicates

---

## Step 8: Stop the Test Server

When done testing, press `Ctrl+C` in the terminal to stop the server.

---

## Step 9: Merge to Main (After Successful Testing)

Once you've verified everything works:

### A. Switch to Your Main Branch

```bash
git checkout main
```

Or if your main branch is called `master`:
```bash
git checkout master
```

### B. Pull Latest Main Branch (Just in Case)

```bash
git pull origin main
```

(Or `git pull origin master` if using master)

### C. Merge the Claude Branch

```bash
git merge claude/hour-entry-bank-register-updates-011CUrNu1RqKzNxYdoTEkMKG
```

If there are conflicts, Git will tell you. You'll need to:
1. Open the conflicted files
2. Look for `<<<<<<<`, `=======`, `>>>>>>>` markers
3. Choose which changes to keep
4. Save the files
5. Run `git add .`
6. Run `git commit`

### D. Push to GitHub

```bash
git push origin main
```

(Or `git push origin master` if using master)

---

## Step 10: Clean Up (Optional)

After merging, you can delete the Claude branch locally:

```bash
git branch -d claude/hour-entry-bank-register-updates-011CUrNu1RqKzNxYdoTEkMKG
```

And from GitHub:
```bash
git push origin --delete claude/hour-entry-bank-register-updates-011CUrNu1RqKzNxYdoTEkMKG
```

---

## Troubleshooting

### "Command not found" errors

**If `git` command not found:**
- Install Git from https://git-scm.com/downloads

**If `python` command not found:**
- Install Python from https://www.python.org/downloads/
- Or use the Windows batch script instead
- Or install Node.js and use `npx http-server`

### "Permission denied" or "Port already in use"

Change the port number:
```bash
python -m http.server 8001
```
Then access at `http://localhost:8001`

### "Cannot checkout branch"

If you have uncommitted changes:
```bash
git stash
git checkout [branch-name]
git stash pop
```

---

## Using Local Claude Code Instead

If you prefer to use Claude Code locally to handle this entire process, use this prompt:

```
I need help pulling and testing changes from a remote Git branch, then merging to main.

Repository: PayTrax (located at /path/to/PayTrax)
Remote branch: claude/hour-entry-bank-register-updates-011CUrNu1RqKzNxYdoTEkMKG

Please:
1. Fetch and checkout the remote branch
2. Start a Python HTTP server on port 8000 for testing
3. After I confirm testing is complete, merge the branch to main
4. Push the merged changes to origin
5. Clean up by deleting the feature branch locally and remotely

This is a vanilla JavaScript app with no build dependencies.
```

Then Claude Code will:
- Execute the git commands
- Start the test server
- Wait for your confirmation
- Complete the merge and cleanup

---

## Summary of Commands (Quick Reference)

```bash
# Navigate to repository
cd /path/to/PayTrax

# Fetch updates from GitHub
git fetch origin

# Switch to Claude's branch
git checkout claude/hour-entry-bank-register-updates-011CUrNu1RqKzNxYdoTEkMKG

# Start test server
python -m http.server 8000

# Access in browser: http://localhost:8000
# Test the features, then press Ctrl+C to stop server

# After testing, merge to main
git checkout main
git pull origin main
git merge claude/hour-entry-bank-register-updates-011CUrNu1RqKzNxYdoTEkMKG
git push origin main

# Optional: Delete the feature branch
git branch -d claude/hour-entry-bank-register-updates-011CUrNu1RqKzNxYdoTEkMKG
git push origin --delete claude/hour-entry-bank-register-updates-011CUrNu1RqKzNxYdoTEkMKG
```

---

## What's New in This Branch?

This branch includes:

1. **Compact Hour Entry UI**
   - Removed redundant "Hours" text from labels
   - Removed "(PTO)" acronym
   - Narrower input boxes (100px max-width)

2. **Bank Register In-Line Editing**
   - Edit button for each transaction
   - Modify date, description, type, and amount in-place
   - Save/Cancel controls

3. **CSV Import with Format Auto-Detection**
   - Supports 3 common bank CSV formats
   - Automatic format detection

4. **Fuzzy Matching for Duplicates**
   - ±2 days date tolerance
   - ±$1 amount tolerance
   - Handles negative signs in amount fields

5. **Two Import Modes**
   - "Sync Only": Adds new transactions without reconciling
   - "Import & Auto-Reconcile": Adds new and marks matches as reconciled

6. **Technical Updates**
   - Service worker cache incremented to v6
   - All amounts use absolute values for reliable matching
