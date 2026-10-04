# ReactLab

A local-first React practical notebook. Every practical owns an independent virtual filesystem, question, tabs, and runnable Sandpack output. The simplified workspace has light and dark themes and an optional GitHub backup connection.

## GitHub sync

Connect GitHub in the header using a personal access token. The app creates a private repository (default: `reactlab-practicals`) and imports existing practicals. Reconnecting only adopts the previously recorded repository ID; unrelated existing repositories are rejected. Tokens are kept only in memory, sent only to GitHub's API, and never placed in localStorage. Refreshing requires reconnecting. One-click OAuth is not configured; it requires a registered GitHub app and secure server-side token handling.

Each practical lives under `practicals/<stable-id>/`, with its question in README.md, source files, and markers for empty folders. Changed snapshots sync after the preview's initial successful React render. A run that fails before rendering does not trigger sync. Later interaction errors do not undo an already synced commit. Connect and Sync all intentionally back up saved work even when it has not been run.

Git trees produce one atomic commit per changed practical on the repository's current default branch. Unchanged snapshots create no commits. Branch updates never force-push and retry concurrent updates. Deleting a practical locally keeps its remote backup; deleting or renaming files inside a practical is reflected at the next sync. Network errors preserve local work and can be retried from the GitHub dialog. Commits use the authenticated user's GitHub noreply email. Private activity must be enabled in GitHub profile settings to appear on the graph, and GitHub controls contribution eligibility and update timing.

The connection requires repository creation and content write permissions. A fine-grained token can be restricted to the dedicated repository after creation; a classic token needs the repo scope. No real account credential or live write was used in development tests; API contract tests cover creation, attribution, no-op sync, atomic updates, authentication failures, and branch conflicts.

## Run locally

Requires Node.js 20.19+ (Node 22 recommended).

```sh
npm install
npm run dev
```

`npm run build` creates the static app in `dist`. `npm test` checks filesystem safety, practical isolation, persistence roundtrips, and Sandpack conversion.

## How it works

- React + Vite + Tailwind CSS; Monaco and its language workers are bundled locally.
- `src/utils/practicals.js` creates independent simple and blank practicals.
- `src/utils/filesystem.js` manages files, explicit empty folders, nested operations, and protected entry files. Renaming does not rewrite imports; the UI reminds students to update them.
- `src/utils/storage.js` is the persistence boundary. One versioned localStorage record stores the complete workspace atomically. Saves are debounced by 450 ms and flushed when the page is hidden or closed. Failures are visible and corrupt saved data is never silently replaced.
- `src/utils/sandpack.js` supplies the complete selected filesystem and managed bootstrap. Only a Run snapshot is sent to Sandpack; edits wait for the next Run. Student code is never evaluated in the host application.
- Sandpack’s external bundler and dependency downloads require internet access. Sandpack displays build/runtime errors inside its isolated preview. No backend, login, package manager UI, or cloud notebook storage is implemented.

## Usage

Create a practical, enter its question, choose a starter, and edit files. Use New file/New folder within the selected folder; nested paths work. The row menus provide rename, duplicate, and confirmed delete. App.jsx and src are protected entry points. Run with the button or Ctrl/Cmd + Enter. Search matches titles and questions. Drag the output divider or focus it and use arrow keys to resize; layout is remembered.

Practicals live in this browser and origin. Clearing browser data removes them; another browser or the published origin has a separate notebook. Do not use the workspace for secrets. No screenshots or analytics are collected. GitHub sync is optional and sends practical source code only after connection.

## Manual acceptance checks

1. Run the Counter example; click increase, decrease, and reset.
2. Create two practicals and verify code edits stay independent.
3. Add nested JSX, CSS, JS, and JSON files; import them from App.jsx and run.
4. Introduce an invalid import or JSX error; verify the output reports it and the editor remains usable, then fix and rerun.
5. Rename/duplicate/delete files and folders; verify import reminders and deletion confirmation.
6. Reload after an edit and verify questions, all files, empty folders, selected practical/file, and panel preferences return.
7. Delete every practical; verify the first-practical empty state.

