# ReactLab

A local-first React practical notebook. Every practical owns an independent virtual filesystem, question, tabs, and runnable Sandpack output.

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

Practicals live in this browser and origin. Clearing browser data removes them; another browser or the published origin has a separate notebook. Do not use the workspace for secrets. No screenshots, analytics, or external app integrations are collected.

## Manual acceptance checks

1. Run the Counter example; click increase, decrease, and reset.
2. Create two practicals and verify code edits stay independent.
3. Add nested JSX, CSS, JS, and JSON files; import them from App.jsx and run.
4. Introduce an invalid import or JSX error; verify the output reports it and the editor remains usable, then fix and rerun.
5. Rename/duplicate/delete files and folders; verify import reminders and deletion confirmation.
6. Reload after an edit and verify questions, all files, empty folders, selected practical/file, and panel preferences return.
7. Delete every practical; verify the first-practical empty state.
