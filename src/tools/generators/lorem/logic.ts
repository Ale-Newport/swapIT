/**
 * Placeholder copy. Two word sources: the traditional scrambled Latin, and plain
 * English filler for when Latin makes a mockup harder to read than it should be.
 */

export type Source = 'latin' | 'english';
export type Unit = 'words' | 'sentences' | 'paragraphs' | 'list';
export type Wrapper = 'none' | 'paragraphs' | 'list';

export type Rng = (maxExclusive: number) => number;

export const randomInt: Rng = (maxExclusive) => {
  if (maxExclusive <= 0) return 0;
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % maxExclusive;
};

const LATIN = `lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor
incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud
exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in
reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint
occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est
laborum perspiciatis unde omnis iste natus error voluptatem accusantium doloremque
laudantium totam rem aperiam eaque ipsa quae ab illo inventore veritatis quasi
architecto beatae vitae dicta explicabo nemo enim ipsam quia voluptas aspernatur aut
odit fugit sed quia consequuntur magni dolores eos ratione sequi nesciunt neque porro
quisquam dolorem adipisci numquam eius modi tempora incidunt magnam quaerat etiam
minima nostrum exercitationem ullam corporis suscipit laboriosam aliquid commodi
consequatur autem vel eum iure reprehenderit voluptate esse quam nihil molestiae
illum fugiat quo voluptas nulla at vero eos accusamus iusto odio dignissimos ducimus
blanditiis praesentium voluptatum deleniti atque corrupti quos quas molestias
excepturi occaecati cupiditate provident similique culpa officia deserunt mollitia
animi laborum dolorum fuga harum rerum facilis expedita distinctio nam libero tempore
cum soluta nobis eligendi optio cumque impedit minus quod maxime placeat facere
possimus assumenda repellendus temporibus autem quibusdam officiis debitis rerum
necessitatibus saepe eveniet voluptates repudiandae recusandae itaque earum hic
tenetur sapiente delectus reiciendis maiores alias perferendis doloribus asperiores
repellat`;

const ENGLISH = `the a of and to in that is for with as on at by from this it not but
have has will can may would should could about after all also any because before
between both during each even every few first from further here how into just least
less like made make many more most much need next now often only other over own part
place point same several since some still such take than their them then there these
they thing think those three through time under until upon used using very want way
well what when where which while who whole why work world year young above across
against along among around behind below beneath beside beyond despite except inside
near outside past through throughout toward within without able actual basic better
brief broad certain clear common complete current early easy entire exact extra
final full general good great high large late light local long main major minor
modern natural normal open plain proper quick quiet ready real recent right sharp
short similar simple single slight small smooth solid special specific standard
strong sudden sure true useful usual varied warm whole wide willing wooden written
account answer balance branch bridge builder camera centre chapter circle client
column comfort concept content context corner country course credit detail effort
element engine example factor family figure finish future garden handle header
history holder impact income island journey letter listing machine manner market
matter measure member method middle minute moment nature notice number object office
option order output package parent partner pattern payment period person picture
policy portion praise price problem process product profile project purpose quality
quarter question reader reason record region report request result return review
reward rhythm sample school screen season second section sector series service
session setting signal simple source spirit stage status story stream street strike
studio subject summer supply surface system target theory thread ticket toolkit
traffic trouble update valley value vision volume weather wonder writing`;

export const SOURCES: Record<Source, string[]> = {
  latin: Array.from(new Set(LATIN.trim().split(/\s+/))),
  english: Array.from(new Set(ENGLISH.trim().split(/\s+/))),
};

export const OPENERS: Record<Source, string> = {
  latin: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit',
  english: 'This is placeholder copy standing in for the words that will go here',
};

export interface LoremOptions {
  unit: Unit;
  count: number;
  source: Source;
  startWithLorem: boolean;
  html: boolean;
}

export const MAX_COUNT = 500;

function pick(words: string[], rng: Rng): string {
  return words[rng(words.length)];
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One sentence of 6–15 words, with a comma somewhere in the longer ones. */
function makeSentence(words: string[], rng: Rng): string {
  const length = 6 + rng(10);
  const picked = Array.from({ length }, () => pick(words, rng));
  if (length > 9) {
    const commaAt = 3 + rng(length - 6);
    picked[commaAt] = `${picked[commaAt]},`;
  }
  return `${capitalise(picked.join(' '))}.`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wrap(blocks: string[], wrapper: Wrapper): string {
  if (wrapper === 'paragraphs') return blocks.map((b) => `<p>${escapeHtml(b)}</p>`).join('\n');
  if (wrapper === 'list') {
    return ['<ul>', ...blocks.map((b) => `  <li>${escapeHtml(b)}</li>`), '</ul>'].join('\n');
  }
  return blocks.join('\n\n');
}

/**
 * Build the requested text. Returns the blocks separately from the joined string
 * so the UI can report how much it produced.
 */
export function generateLorem(options: LoremOptions, rng: Rng = randomInt): { text: string; blocks: string[] } {
  const words = SOURCES[options.source];
  const count = Math.max(1, Math.min(MAX_COUNT, Math.round(options.count) || 1));
  const opener = OPENERS[options.source];

  if (options.unit === 'words') {
    const openerWords = options.startWithLorem ? opener.replace(/,/g, '').split(' ') : [];
    const picked = [...openerWords.slice(0, count)];
    while (picked.length < count) picked.push(pick(words, rng));
    const line = `${capitalise(picked.join(' '))}.`;
    return { text: options.html ? wrap([line], 'paragraphs') : line, blocks: [line] };
  }

  if (options.unit === 'sentences' || options.unit === 'list') {
    const blocks = Array.from({ length: count }, (_, i) =>
      i === 0 && options.startWithLorem ? `${opener}.` : makeSentence(words, rng),
    );
    const wrapper: Wrapper = options.html ? (options.unit === 'list' ? 'list' : 'paragraphs') : 'none';
    const text =
      wrapper === 'none' && options.unit === 'sentences'
        ? blocks.join(' ')
        : wrapper === 'none'
          ? blocks.map((b) => `• ${b}`).join('\n')
          : wrap(blocks, wrapper);
    return { text, blocks };
  }

  const blocks = Array.from({ length: count }, (_, paragraph) => {
    const sentences = 3 + rng(4);
    return Array.from({ length: sentences }, (_, i) =>
      paragraph === 0 && i === 0 && options.startWithLorem ? `${opener}.` : makeSentence(words, rng),
    ).join(' ');
  });
  return { text: options.html ? wrap(blocks, 'paragraphs') : blocks.join('\n\n'), blocks };
}

export function countWords(text: string): number {
  const stripped = text.replace(/<[^>]*>/g, ' ');
  const matches = stripped.trim().match(/[^\s]+/g);
  return matches ? matches.length : 0;
}
