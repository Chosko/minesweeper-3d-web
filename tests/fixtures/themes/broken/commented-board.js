// A board module with line comments and a block comment (test-only): comments are not fetched, so
/* the remote-URL check, which reads http: or // only outside comments, must not flag this file. */
export const BOARD = Object.freeze({ id: 'broken-remote-font' }); // a trailing comment
