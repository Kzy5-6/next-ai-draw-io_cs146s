# Independent Review Lab

This exercise is isolated from the application code. It demonstrates a path-containment bug: a string-prefix check can accept a sibling directory whose name begins with the allowed directory name.

Run the regression test:

```sh
node --test course-labs/review/report-path.test.js
```

The test covers a path inside the output directory, parent traversal, a sibling-prefix path, and an absolute path outside the output directory. The vulnerable implementation was repaired using a path-component-aware containment check in `report-path.js`. All four regression tests pass with the repaired implementation.
