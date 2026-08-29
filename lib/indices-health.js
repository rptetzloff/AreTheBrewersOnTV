/** Deciding when a degraded start is acceptable and when it is a defect.
 *
 *  The box-score indices have a fallback: if the committed artifacts cannot be
 *  read, rebuild them from the CSVs. That fallback is correct and has been used
 *  in anger. What it lacked was any notion that some failures are ordinary and
 *  others mean something is broken, so it treated them alike — and the site
 *  spent a week serving box scores with no Scoring Summary while returning 200
 *  on every request.
 *
 *  The distinction is simple and was always available:
 *
 *    no manifest        a fresh clone before scripts/build-indices.mjs has run.
 *                       Ordinary. Fall back quietly, as before.
 *    manifest present   the artifacts are supposed to work. If they do not, a
 *    but unreadable     deploy is broken. Say so and refuse to start.
 *
 *  The second case is what happened: .dockerignore excluded scripts/, the
 *  import of build-indices.mjs threw, the throw was caught, and a warning
 *  scrolled past in a log nobody reads.
 */

/** The first line of a Git LFS pointer file.
 *
 *  Not a curiosity. plays.lfs.csv is 388MB and tracked in LFS; with the smudge
 *  filter off — which is now the case on every build, deliberately, since the
 *  image excludes the file anyway — the working tree gets a 130-byte pointer
 *  instead of the data.
 *
 *  Handed to the CSV parser, a pointer yields zero rows: no scoring plays, no
 *  error, no clue. That is the same silent-empty failure as above wearing a
 *  different hat, so it gets the same treatment.
 */
const LFS_POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1';

/** Whether a file's opening bytes are an LFS pointer rather than its content.
 *  Takes a string so the caller decides how much to read — the first 200 bytes
 *  are plenty and reading 388MB to find out would defeat the purpose. */
export function isLfsPointer(head) {
	return typeof head === 'string' && head.trimStart().startsWith(LFS_POINTER_PREFIX);
}

/** What to do about an index load that did not produce artifacts.
 *
 *  Returns { fatal, reason }. `fatal` means refuse to start: the deployment is
 *  broken and a container that never comes up is a better outcome than one
 *  quietly serving incomplete pages.
 *
 *  `allowDegraded` is the escape hatch, for working on a checkout that has
 *  neither artifacts nor a fetched play-by-play file and does not care about box
 *  scores. It has to be asked for; it is not the default, because the default is
 *  what runs in production.
 */
export function indexLoadOutcome({ manifestPresent, error = null, playsIsPointer = false, allowDegraded = false }) {
	if (allowDegraded) {
		return { fatal: false, reason: 'degraded start allowed explicitly' };
	}
	if (manifestPresent && error) {
		return {
			fatal: true,
			reason: `the committed indices exist but could not be read: ${error}. `
				+ 'This is a broken deploy, not a fresh checkout — every box score would '
				+ 'render without its Scoring Summary and every request would still return 200.',
		};
	}
	if (playsIsPointer) {
		return {
			fatal: true,
			reason: 'data/plays.lfs.csv is a Git LFS pointer, not the file. Rebuilding '
				+ 'indices from it would produce an empty scoring-plays index rather than '
				+ 'an error. Either fetch the LFS object or commit the artifacts.',
		};
	}
	return { fatal: false, reason: 'no committed indices — rebuilding from CSV' };
}
