import { t, theory, quiz, py, type ModuleDef } from '../helpers.ts';

export const coreDataStructuresModule: ModuleDef = {
      title: 'Core Data Structures',
      lessons: [
        {
          title: 'Stacks and Queues',
          description: 'Last-in-first-out and first-in-first-out containers.',
          steps: [
            theory('Stacks and Queues', 9, t`
# Stacks and Queues

## Stack (LIFO)

The last item added is the first removed, like a pile of plates. A Python list is a perfect stack:

¦¦¦python
stack = []
stack.append(1)    # push
stack.append(2)
stack.pop()        # 2  (pop from the end, O(1))
stack[-1]          # peek
¦¦¦

Stacks power undo, expression evaluation, backtracking and the function call stack itself.

## Queue (FIFO)

The first item added is the first removed, like a line at a shop. Do **not** use ¦list.pop(0)¦, which is O(n). Use ¦collections.deque¦:

¦¦¦python
from collections import deque

queue = deque()
queue.append("a")       # enqueue
queue.append("b")
queue.popleft()         # "a" (O(1))
¦¦¦

## Matching brackets

The classic stack problem: scan a string; push opening brackets; on a closing bracket the top of the stack must be its partner. At the end the stack must be empty.

## Reverse Polish notation

In RPN, operators follow their operands: ¦3 4 +¦ means ¦3 + 4¦. Evaluate with a stack: push numbers; on an operator pop two, apply it, push the result. No parentheses are ever needed.
`),
            quiz('Pick the structure', 'single_choice',
              'You are processing tasks in the order they arrive, oldest first. Which structure fits best?',
              [['A queue (collections.deque)', true], ['A stack (list used with append/pop)', false], ['A set', false], ['A dictionary keyed by arrival time', false]],
              'FIFO is exactly queue behaviour, and deque.popleft() is O(1), unlike list.pop(0).'),
            py('Balanced Brackets', 12, {
              statement: 'Read a string made of the characters ()[]{} and print Balanced if every bracket is closed in the correct order, otherwise Not balanced. The empty string is balanced.',
              input: 'A single line (possibly empty).',
              output: 'Balanced or Not balanced.',
              constraints: 'At most 10^5 characters.',
              starter: t`
import sys

text = sys.stdin.read().strip()
`,
              solution: t`
import sys

text = sys.stdin.read().strip()
pairs = {")": "(", "]": "[", "}": "{"}
stack = []
ok = True
for ch in text:
    if ch in "([{":
        stack.append(ch)
    elif ch in pairs:
        if not stack or stack.pop() != pairs[ch]:
            ok = False
            break
print("Balanced" if ok and not stack else "Not balanced")
`,
              hints: ['Push openers; on a closer compare with the top of the stack.', 'Do not forget to check the stack is empty at the end.'],
              explanation: 'Each closing bracket must match the most recent unmatched opener, which is the top of the stack.',
              tests: [
                { stdin: '([]{})', out: 'Balanced' },
                { stdin: '(]', out: 'Not balanced' },
                { stdin: ')(', out: 'Not balanced', hidden: true },
                { stdin: '', out: 'Balanced', hidden: true },
                { stdin: '((()', out: 'Not balanced', hidden: true },
              ],
            }),
            py('RPN Calculator', 12, {
              statement: 'Evaluate a Reverse Polish Notation expression containing integers and the operators + - *. Print the integer result.',
              input: 'A single line of space-separated tokens.',
              output: 'The result.',
              constraints: 'The expression is always valid; intermediate results fit in 64 bits.',
              starter: t`
tokens = input().split()
stack = []
`,
              solution: t`
tokens = input().split()
stack = []
for tok in tokens:
    if tok in "+-*" and len(tok) == 1:
        b = stack.pop()
        a = stack.pop()
        if tok == "+":
            stack.append(a + b)
        elif tok == "-":
            stack.append(a - b)
        else:
            stack.append(a * b)
    else:
        stack.append(int(tok))
print(stack[-1])
`,
              hints: ['Pop b first, then a: for subtraction the order matters (a - b).', 'Negative numbers like -3 are not operators; check the token length.'],
              explanation: 'Operands wait on the stack until an operator consumes the two most recent ones.',
              tests: [
                { stdin: '3 4 + 2 *', out: '14' },
                { stdin: '5 1 2 + 4 * + 3 -', out: '14' },
                { stdin: '10 2 8 * + 3 -', out: '23', hidden: true },
                { stdin: '-3 4 *', out: '-12', hidden: true },
              ],
            }),
          ],
        },
        {
          title: 'Hash Maps and Sets',
          description: 'Constant-time lookup and counting.',
          steps: [
            theory('Hashing', 9, t`
# Hash Maps and Sets

A **hash map** (Python ¦dict¦) stores key-value pairs. A key is turned into a number (its hash) that points straight to where its value lives, so lookup, insert and delete are **O(1) on average**. A **set** is the same idea without values.

¦¦¦python
seen = set()
for x in data:
    if x in seen:       # O(1)
        print("duplicate", x)
    seen.add(x)
¦¦¦

## Keys must be hashable

Immutable values (numbers, strings, tuples of those) work. Lists and dicts do not. To use a list-like key, convert it to a ¦tuple¦ or ¦frozenset¦.

## Patterns

- **Counting**: ¦collections.Counter(items)¦ or a manual ¦dict.get¦ loop.
- **Membership**: replace ¦x in some_list¦ (O(n)) with a set (O(1)).
- **Grouping**: ¦dict[key].append(item)¦ with ¦collections.defaultdict(list)¦.
- **Complement lookup**: while scanning, check whether ¦target - x¦ is already in the map (the O(n) Two Sum).

## Trade-offs

Hash maps spend memory to save time and give no ordering guarantees across implementations (Python dicts happen to keep insertion order). If you need sorted keys, sort them or use another structure.

## Anagram trick

Two words are anagrams exactly when their sorted letters are identical, so ¦"".join(sorted(word))¦ makes a perfect grouping key.
`),
            quiz('Hashable keys', 'multiple_choice',
              'Which of these can be used as a dictionary key?',
              [['"abc"', true], ['(1, 2)', true], ['[1, 2]', false], ['{"a": 1}', false]],
              'Keys must be hashable, which requires immutability. Strings and tuples of hashable values qualify; lists and dicts do not.'),
            py('First Unique Character', 12, {
              statement: 'Read a lowercase string and print the index of the first character that appears exactly once, or -1 if every character repeats.',
              input: 'A single line of lowercase letters.',
              output: 'An index or -1.',
              constraints: '1 <= length <= 10^5',
              starter: t`
s = input().strip()
`,
              solution: t`
s = input().strip()
counts = {}
for ch in s:
    counts[ch] = counts.get(ch, 0) + 1
answer = -1
for i, ch in enumerate(s):
    if counts[ch] == 1:
        answer = i
        break
print(answer)
`,
              hints: ['Make one pass to count, a second pass to find the first count of 1.'],
              explanation: 'Two linear passes with a counting dictionary: O(n) time.',
              tests: [
                { stdin: 'leetcode', out: '0' },
                { stdin: 'loveleetcode', out: '2' },
                { stdin: 'aabb', out: '-1', hidden: true },
                { stdin: 'abcabcd', out: '6', hidden: true },
              ],
            }),
            py('Group Anagrams', 15, {
              statement:
                'Read a line of words. Group the words that are anagrams of each other. Print one group per line: the words in the group sorted alphabetically and separated by spaces. Print the groups sorted alphabetically as whole lines.',
              input: 'A single line of lowercase words.',
              output: 'One line per group.',
              constraints: 'At most 1000 words.',
              starter: t`
words = input().split()
groups = {}
`,
              solution: t`
words = input().split()
groups = {}
for w in words:
    key = "".join(sorted(w))
    groups.setdefault(key, []).append(w)
lines = [" ".join(sorted(g)) for g in groups.values()]
for line in sorted(lines):
    print(line)
`,
              hints: ['The sorted letters of a word are the same for every anagram.', 'Build the output lines first, then sort them.'],
              explanation: 'A canonical form (sorted letters) turns "are these anagrams?" into a dictionary lookup.',
              tests: [
                { stdin: 'eat tea tan ate nat bat', out: 'ate eat tea\nbat\nnat tan' },
                { stdin: 'listen silent enlist google gogole', out: 'enlist listen silent\ngogole google', hidden: true },
              ],
            }),
          ],
        },
      ],
};
