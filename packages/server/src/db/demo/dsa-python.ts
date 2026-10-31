import { t, theory, video, quiz, py, type CourseDef } from './helpers.ts';

export const dsaPython: CourseDef = {
  slug: 'data-structures-algorithms-python',
  mentorEmail: 'rohan.iyer@zur.local',
  title: 'Data Structures and Algorithms in Python',
  description:
    'The core toolkit for solving problems efficiently: complexity analysis, searching, stacks, hash maps, recursion, sorting, trees and graphs. Every lesson ends with graded problems in the style of technical interviews.',
  tags: ['algorithms', 'data-structures', 'interview'],
  difficulty: 'intermediate',
  outcomes: [
    'Estimate the time complexity of code with Big-O notation',
    'Choose the right data structure for a problem',
    'Write recursive and iterative solutions confidently',
    'Implement classic sorting and searching algorithms',
    'Traverse trees and graphs with DFS and BFS',
  ],
  prerequisites: 'Comfortable with Python functions, loops, lists and dictionaries.',
  modules: [
    {
      title: 'Thinking About Efficiency',
      lessons: [
        {
          title: 'Big-O Basics',
          description: 'Measuring how algorithms scale.',
          steps: [
            theory('What Big-O Means', 10, t`
# What Big-O Means

Two programs can both be correct and yet one finishes in a blink while the other takes hours. **Big-O notation** describes how the work grows as the input size ¦n¦ grows, ignoring constants and small terms.

| Class | Name | Example |
| --- | --- | --- |
| O(1) | constant | dictionary lookup, list index |
| O(log n) | logarithmic | binary search |
| O(n) | linear | scan a list |
| O(n log n) | linearithmic | good sorting algorithms |
| O(n²) | quadratic | nested loops over the same data |
| O(2ⁿ) | exponential | naive subset enumeration |

## Reading code

¦¦¦python
def has_duplicate(items):
    for i in range(len(items)):          # n iterations
        for j in range(i + 1, len(items)):  # up to n iterations
            if items[i] == items[j]:
                return True
    return False
¦¦¦

Two nested loops over the input: **O(n²)**. With a set it becomes **O(n)**:

¦¦¦python
def has_duplicate(items):
    return len(set(items)) != len(items)
¦¦¦

## Rules of thumb

- Drop constants: ¦3n¦ is O(n).
- Keep the dominant term: ¦n² + n¦ is O(n²).
- Sequential steps add; nested steps multiply.
- Also think about **space**: the extra memory your algorithm needs.

> For n = 1,000,000 an O(n²) algorithm needs about 10¹² steps. That is the difference between a second and a day.
`),
            video('Algorithms Course Overview', 15, 'pkYVOmU3MgA',
              'This overview introduces the idea of measuring algorithms by how their running time grows with the input. The instructor walks through a linear search and a binary search, counts the steps each takes on lists of increasing size, and shows why the second approach scales so much better. The rest of the course applies the same method to stacks, hash maps, sorting, trees and graphs.'),
            quiz('Estimate the complexity', 'single_choice',
              'What is the time complexity of a loop over a list of ¦n¦ items that, for each item, loops over the whole list again?'.replaceAll('¦', '`'),
              [['O(n²)', true], ['O(n)', false], ['O(n log n)', false], ['O(2n)', false]],
              'Nested loops each running n times perform n × n = n² iterations. O(2n) is just O(n) and is not the right answer here.'),
            py('Two Sum', 12, {
              statement:
                'Given a list of integers and a target, print the indices i and j (i < j) of the first pair whose values add to the target. "First" means the smallest i, then the smallest j. If no pair exists print No solution.',
              input: 'Line 1: space-separated integers. Line 2: the target integer.',
              output: 'Two indices separated by a space, or No solution.',
              constraints: '2 <= n <= 2000',
              starter: t`
nums = [int(x) for x in input().split()]
target = int(input())
`,
              solution: t`
nums = [int(x) for x in input().split()]
target = int(input())
answer = None
for i in range(len(nums)):
    for j in range(i + 1, len(nums)):
        if nums[i] + nums[j] == target:
            answer = (i, j)
            break
    if answer:
        break
print(f"{answer[0]} {answer[1]}" if answer else "No solution")
`,
              hints: ['Two nested loops with j starting after i give every pair once.', 'Stop as soon as you find the first match.'],
              explanation: 'The brute force O(n²) solution is accepted here. Challenge: use a dictionary of value -> index to reach O(n).',
              tests: [
                { stdin: '2 7 11 15\n9', out: '0 1' },
                { stdin: '3 2 4\n6', out: '1 2' },
                { stdin: '1 5 3 7\n10', out: '2 3', hidden: true },
                { stdin: '1 2 3\n100', out: 'No solution', hidden: true },
              ],
            }),
          ],
        },
        {
          title: 'Searching',
          description: 'Linear and binary search.',
          steps: [
            theory('Linear vs Binary Search', 9, t`
# Linear vs Binary Search

## Linear search: O(n)

Check items one by one. Works on any list.

¦¦¦python
def linear_search(items, target):
    for i, value in enumerate(items):
        if value == target:
            return i
    return -1
¦¦¦

## Binary search: O(log n)

If the list is **sorted** you can discard half of it every step by comparing with the middle:

¦¦¦python
def binary_search(items, target):
    lo, hi = 0, len(items) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if items[mid] == target:
            return mid
        if items[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
¦¦¦

For a million items that is at most about 20 comparisons.

## Common mistakes

- Using ¦lo < hi¦ instead of ¦lo <= hi¦ and missing the last candidate.
- Forgetting to move past ¦mid¦ (¦lo = mid¦ can loop forever).
- Running binary search on unsorted data. It silently returns wrong answers.

Python's ¦bisect¦ module implements the same idea; knowing how to write it yourself is still an interview staple.
`),
            quiz('When can you use binary search?', 'multiple_choice',
              'Select the conditions required for binary search to work correctly.',
              [['The data is sorted', true], ['You can access any element by index in O(1)', true], ['The list contains no duplicates', false], ['The list length is a power of two', false]],
              'Sortedness and random access are what matter. Duplicates just mean several valid answers; the length is irrelevant.'),
            py('Binary Search', 12, {
              statement: 'Given a sorted list and a target, print the index of the target or -1 if absent. Implement it with binary search.',
              input: 'Line 1: sorted space-separated integers (distinct). Line 2: the target.',
              output: 'The index, or -1.',
              constraints: '1 <= n <= 10^5',
              starter: t`
nums = [int(x) for x in input().split()]
target = int(input())


def binary_search(items, target):
    pass


print(binary_search(nums, target))
`,
              solution: t`
nums = [int(x) for x in input().split()]
target = int(input())


def binary_search(items, target):
    lo, hi = 0, len(items) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if items[mid] == target:
            return mid
        if items[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1


print(binary_search(nums, target))
`,
              hints: ['Keep two indices, lo and hi, around the part still to be searched.', 'Loop while lo <= hi.'],
              explanation: 'Each iteration halves the search interval, giving O(log n).',
              tests: [
                { stdin: '1 3 5 7 9\n7', out: '3' },
                { stdin: '1 3 5\n4', out: '-1' },
                { stdin: '2\n2', out: '0', hidden: true },
                { stdin: '1 2 3 4 5 6\n1', out: '0', hidden: true },
                { stdin: '1 2 3 4 5 6\n6', out: '5', hidden: true },
              ],
            }),
          ],
        },
      ],
    },
    {
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
    },
    {
      title: 'Recursion and Sorting',
      lessons: [
        {
          title: 'Recursion',
          description: 'Solving problems by solving smaller versions of them.',
          steps: [
            theory('Thinking Recursively', 10, t`
# Thinking Recursively

A **recursive** function calls itself on a smaller version of the problem. Every recursive function needs:

1. A **base case** that returns directly.
2. A **recursive case** that moves towards the base case.

¦¦¦python
def factorial(n):
    if n <= 1:          # base case
        return 1
    return n * factorial(n - 1)
¦¦¦

## The call stack

Each call waits for the one below it. Python limits depth (about 1000 by default), so deep recursion on large inputs needs an iterative rewrite.

## Overlapping subproblems and memoization

Naive Fibonacci recomputes the same values exponentially many times:

¦¦¦python
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)   # O(2^n)
¦¦¦

Cache results and it becomes O(n):

¦¦¦python
from functools import lru_cache

@lru_cache(maxsize=None)
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)
¦¦¦

## Divide and conquer

Hanoi, merge sort and tree traversal all split a problem into independent smaller pieces and combine the answers.

## Tower of Hanoi

To move ¦n¦ disks from A to C using B: move ¦n-1¦ disks from A to B, move the largest disk from A to C, then move the ¦n-1¦ disks from B to C. Total moves: 2ⁿ - 1.
`),
            quiz('Base case', 'single_choice',
              'What happens if a recursive function has no reachable base case?',
              [['It recurses until Python raises RecursionError', true], ['It returns None', false], ['It loops forever using constant memory', false], ['Python automatically inserts a base case', false]],
              'Every call adds a stack frame. Without a base case the stack grows until the recursion limit is hit.'),
            py('Fibonacci with Memoization', 12, {
              statement: 'Print the n-th Fibonacci number where F(0) = 0 and F(1) = 1. Your solution must handle n up to 90 quickly.',
              input: 'A single integer n.',
              output: 'F(n).',
              constraints: '0 <= n <= 90',
              starter: t`
from functools import lru_cache


@lru_cache(maxsize=None)
def fib(n):
    pass


print(fib(int(input())))
`,
              solution: t`
from functools import lru_cache


@lru_cache(maxsize=None)
def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)


print(fib(int(input())))
`,
              hints: ['Base cases: n = 0 and n = 1 return n.', 'The decorator remembers earlier results automatically.'],
              explanation: 'Memoization turns an exponential recursion into a linear one because each value is computed once.',
              tests: [
                { stdin: '10', out: '55' },
                { stdin: '50', out: '12586269025' },
                { stdin: '0', out: '0', hidden: true },
                { stdin: '1', out: '1', hidden: true },
                { stdin: '90', out: '2880067194370816120', hidden: true },
              ],
            }),
            py('Tower of Hanoi', 15, {
              statement:
                'Print the moves that transfer n disks from peg A to peg C using peg B as spare, one move per line in the form X -> Y. Use the standard recursive strategy.',
              input: 'A single integer n.',
              output: '2^n - 1 lines of the form X -> Y.',
              constraints: '1 <= n <= 10',
              starter: t`
def hanoi(n, source, target, spare):
    pass


hanoi(int(input()), "A", "C", "B")
`,
              solution: t`
def hanoi(n, source, target, spare):
    if n == 0:
        return
    hanoi(n - 1, source, spare, target)
    print(f"{source} -> {target}")
    hanoi(n - 1, spare, target, source)


hanoi(int(input()), "A", "C", "B")
`,
              hints: ['Move n-1 disks out of the way first, move one disk, then move the n-1 disks on top.', 'n = 0 is a convenient base case that does nothing.'],
              explanation: 'The recursion mirrors the English description of the solution.',
              tests: [
                { stdin: '1', out: 'A -> C' },
                { stdin: '2', out: 'A -> B\nA -> C\nB -> C' },
                { stdin: '3', out: 'A -> C\nA -> B\nC -> B\nA -> C\nB -> A\nB -> C\nA -> C', hidden: true },
              ],
            }),
          ],
        },
        {
          title: 'Sorting',
          description: 'From quadratic sorts to divide and conquer.',
          steps: [
            theory('Sorting Algorithms', 10, t`
# Sorting Algorithms

## Simple sorts: O(n²)

**Bubble sort** repeatedly swaps adjacent out-of-order pairs. **Insertion sort** grows a sorted prefix by inserting the next item into place. Insertion sort is genuinely fast on small or nearly-sorted data.

## Merge sort: O(n log n)

1. Split the list in half.
2. Sort each half recursively.
3. **Merge** the two sorted halves into one.

¦¦¦python
def merge(left, right):
    out, i, j = [], 0, 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            out.append(left[i]); i += 1
        else:
            out.append(right[j]); j += 1
    return out + left[i:] + right[j:]
¦¦¦

Merge sort is **stable** (equal items keep their relative order) and always O(n log n), at the cost of O(n) extra memory.

## Quick sort

Pick a pivot, partition into smaller/larger, recurse. Average O(n log n), worst case O(n²) with bad pivots, but it sorts in place and is fast in practice.

## In real code

Use ¦sorted()¦ or ¦list.sort()¦. Python's Timsort is a stable, highly tuned hybrid of merge and insertion sort and is O(n log n) worst case. Writing your own is for learning and interviews. Sort by a custom key with ¦sorted(items, key=lambda p: p.age)¦.

## Lower bound

Any sort that works only by comparing items needs Ω(n log n) comparisons in the worst case. Counting sort and radix sort beat this by not comparing.
`),
            quiz('Which sort?', 'multiple_choice',
              'Select the algorithms with O(n log n) worst-case time.',
              [['Merge sort', true], ['Python\'s built-in sorted()', true], ['Bubble sort', false], ['Insertion sort', false]],
              'Merge sort and Timsort guarantee O(n log n). Bubble and insertion sort are O(n²) in the worst case (insertion sort is O(n) only on nearly sorted data).'),
            py('Merge Sort', 15, {
              statement: 'Sort a list of integers in ascending order by implementing merge sort yourself (do not call sorted or list.sort). Print the result as space-separated numbers.',
              input: 'A single line of integers (at least one).',
              output: 'The sorted numbers on one line.',
              constraints: '1 <= n <= 10^4',
              starter: t`
def merge_sort(items):
    pass


nums = [int(x) for x in input().split()]
print(" ".join(map(str, merge_sort(nums))))
`,
              solution: t`
def merge_sort(items):
    if len(items) <= 1:
        return items
    mid = len(items) // 2
    left = merge_sort(items[:mid])
    right = merge_sort(items[mid:])
    out, i, j = [], 0, 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            out.append(left[i])
            i += 1
        else:
            out.append(right[j])
            j += 1
    return out + left[i:] + right[j:]


nums = [int(x) for x in input().split()]
print(" ".join(map(str, merge_sort(nums))))
`,
              hints: ['A list of length 0 or 1 is already sorted.', 'After one half runs out, append whatever remains of the other.'],
              explanation: 'Splitting gives log n levels; merging does O(n) work per level.',
              tests: [
                { stdin: '5 2 9 1', out: '1 2 5 9' },
                { stdin: '3', out: '3', hidden: true },
                { stdin: '4 4 2 -1 0', out: '-1 0 2 4 4', hidden: true },
              ],
            }),
          ],
        },
      ],
    },
    {
      title: 'Trees and Graphs',
      lessons: [
        {
          title: 'Binary Search Trees',
          description: 'Hierarchical data and ordered insertion.',
          steps: [
            theory('Trees and BSTs', 10, t`
# Trees and Binary Search Trees

A **tree** is a set of nodes connected so that there is exactly one path between any two nodes. A **binary tree** gives each node at most two children.

A **binary search tree (BST)** keeps an ordering rule: everything in a node's left subtree is smaller, everything in the right subtree is larger.

¦¦¦python
class Node:
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None


def insert(node, key):
    if node is None:
        return Node(key)
    if key < node.key:
        node.left = insert(node.left, key)
    elif key > node.key:
        node.right = insert(node.right, key)
    return node
¦¦¦

## Traversals

- **In-order** (left, node, right) visits a BST's keys in sorted order.
- **Pre-order** (node, left, right) is useful for copying a tree.
- **Post-order** (left, right, node) is useful for deleting one.

## Height

The height is the number of nodes on the longest root-to-leaf path:

¦¦¦python
def height(node):
    if node is None:
        return 0
    return 1 + max(height(node.left), height(node.right))
¦¦¦

## Performance

Search, insert and delete take O(h). A balanced tree has h ≈ log n; inserting already sorted keys produces a "stick" with h = n. Self-balancing variants (AVL, red-black) prevent that.
`),
            quiz('In-order traversal', 'single_choice',
              'What does an in-order traversal of a binary search tree produce?',
              [['The keys in ascending order', true], ['The keys in insertion order', false], ['The keys in descending order', false], ['The keys level by level', false]],
              'In-order visits the left subtree (smaller), the node, then the right subtree (larger), which yields sorted output.'),
            py('BST Inorder and Height', 18, {
              statement:
                'Insert the given integers into an initially empty binary search tree in order, ignoring duplicates. Print the in-order traversal (space-separated) on the first line and Height: H (number of nodes on the longest root-to-leaf path) on the second.',
              input: 'A single line of integers (at least one).',
              output: 'Line 1: in-order keys. Line 2: Height: H.',
              constraints: '1 <= n <= 1000',
              starter: t`
class Node:
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None


def insert(node, key):
    pass


def inorder(node, out):
    pass


def height(node):
    pass


root = None
for value in input().split():
    root = insert(root, int(value))
result = []
inorder(root, result)
print(" ".join(map(str, result)))
print(f"Height: {height(root)}")
`,
              solution: t`
class Node:
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None


def insert(node, key):
    if node is None:
        return Node(key)
    if key < node.key:
        node.left = insert(node.left, key)
    elif key > node.key:
        node.right = insert(node.right, key)
    return node


def inorder(node, out):
    if node is None:
        return
    inorder(node.left, out)
    out.append(node.key)
    inorder(node.right, out)


def height(node):
    if node is None:
        return 0
    return 1 + max(height(node.left), height(node.right))


root = None
for value in input().split():
    root = insert(root, int(value))
result = []
inorder(root, result)
print(" ".join(map(str, result)))
print(f"Height: {height(root)}")
`,
              hints: ['insert returns the (possibly new) root of the subtree.', 'An empty tree has height 0.'],
              explanation: 'Three tiny recursive functions, each following the shape of the tree.',
              tests: [
                { stdin: '5 3 8 1 4 7 9', out: '1 3 4 5 7 8 9\nHeight: 3' },
                { stdin: '1 2 3 4', out: '1 2 3 4\nHeight: 4', hidden: true },
                { stdin: '5 5 5', out: '5\nHeight: 1', hidden: true },
              ],
            }),
          ],
        },
        {
          title: 'Graph Traversal',
          description: 'Breadth-first and depth-first search.',
          steps: [
            theory('Graphs, BFS and DFS', 12, t`
# Graphs, BFS and DFS

A **graph** is a set of nodes (vertices) joined by edges. Roads, social networks, dependencies and game boards are all graphs.

## Representing a graph

An **adjacency list** maps each node to its neighbours:

¦¦¦python
from collections import defaultdict

graph = defaultdict(list)
for u, v in edges:
    graph[u].append(v)
    graph[v].append(u)     # omit for a directed graph
¦¦¦

## Breadth-first search (BFS)

Explores the graph in rings around the start using a **queue**. In an unweighted graph it finds the **shortest path** (fewest edges).

¦¦¦python
from collections import deque

def bfs(graph, start, goal):
    dist = {start: 0}
    queue = deque([start])
    while queue:
        node = queue.popleft()
        if node == goal:
            return dist[node]
        for nxt in graph[node]:
            if nxt not in dist:
                dist[nxt] = dist[node] + 1
                queue.append(nxt)
    return -1
¦¦¦

## Depth-first search (DFS)

Goes as deep as possible before backtracking, using recursion or a **stack**. Good for connectivity, cycle detection and flood fill.

## Always track visited nodes

Without a visited set a graph with a cycle sends you round it forever. Mark nodes when you *enqueue* them so each is processed once.

## Complexity

With an adjacency list both searches run in O(V + E).

## Grids are graphs too

A 2-D grid is a graph where each cell connects to its four neighbours. Counting "islands" of connected cells is DFS or BFS from each unvisited land cell.
`),
            quiz('BFS or DFS?', 'single_choice',
              'You need the minimum number of edges between two nodes of an unweighted graph. Which approach guarantees the right answer?',
              [['Breadth-first search', true], ['Depth-first search', false], ['Either one, they always agree', false], ['Sorting the nodes first', false]],
              'BFS visits nodes in order of distance from the start, so the first time it reaches a node is along a shortest path. DFS may find a longer path first.'),
            py('Shortest Path', 18, {
              statement:
                'Given an undirected graph, print the minimum number of edges on a path from s to t, or -1 if t is unreachable.',
              input: 'Line 1: n m (nodes numbered 0..n-1, m edges). Next m lines: u v. Last line: s t.',
              output: 'The distance, or -1.',
              constraints: '1 <= n <= 10^4, 0 <= m <= 5*10^4',
              starter: t`
import sys
from collections import deque

data = sys.stdin.read().split()
n, m = int(data[0]), int(data[1])
graph = [[] for _ in range(n)]
pos = 2
for _ in range(m):
    u, v = int(data[pos]), int(data[pos + 1])
    pos += 2
    graph[u].append(v)
    graph[v].append(u)
s, t = int(data[pos]), int(data[pos + 1])
`,
              solution: t`
import sys
from collections import deque

data = sys.stdin.read().split()
n, m = int(data[0]), int(data[1])
graph = [[] for _ in range(n)]
pos = 2
for _ in range(m):
    u, v = int(data[pos]), int(data[pos + 1])
    pos += 2
    graph[u].append(v)
    graph[v].append(u)
s, t = int(data[pos]), int(data[pos + 1])

dist = {s: 0}
queue = deque([s])
while queue:
    node = queue.popleft()
    if node == t:
        break
    for nxt in graph[node]:
        if nxt not in dist:
            dist[nxt] = dist[node] + 1
            queue.append(nxt)
print(dist.get(t, -1))
`,
              hints: ['Use a deque as the BFS queue.', 'Record the distance when you first discover a node.'],
              explanation: 'BFS discovers nodes in order of distance, so the recorded distance is minimal.',
              tests: [
                { stdin: '5 5\n0 1\n1 2\n2 3\n3 4\n0 4\n0 3', out: '2' },
                { stdin: '4 2\n0 1\n2 3\n0 3', out: '-1', hidden: true },
                { stdin: '3 2\n0 1\n1 2\n0 2', out: '2', hidden: true },
                { stdin: '2 0\n1 1', out: '0', hidden: true },
              ],
            }),
            py('Number of Islands', 18, {
              statement:
                'A grid contains 1 (land) and 0 (water). Count the islands: groups of land cells connected horizontally or vertically.',
              input: 'Line 1: rows cols. Then rows lines of cols characters (0 or 1).',
              output: 'The number of islands.',
              constraints: '1 <= rows, cols <= 100',
              starter: t`
import sys

lines = sys.stdin.read().split()
rows, cols = int(lines[0]), int(lines[1])
grid = [list(lines[2 + r]) for r in range(rows)]
`,
              solution: t`
import sys

sys.setrecursionlimit(20000)
lines = sys.stdin.read().split()
rows, cols = int(lines[0]), int(lines[1])
grid = [list(lines[2 + r]) for r in range(rows)]


def sink(r, c):
    stack = [(r, c)]
    grid[r][c] = "0"
    while stack:
        x, y = stack.pop()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < rows and 0 <= ny < cols and grid[nx][ny] == "1":
                grid[nx][ny] = "0"
                stack.append((nx, ny))


count = 0
for r in range(rows):
    for c in range(cols):
        if grid[r][c] == "1":
            count += 1
            sink(r, c)
print(count)
`,
              hints: ['When you meet land, count one island and then "sink" every connected land cell.', 'An explicit stack avoids hitting the recursion limit on large grids.'],
              explanation: 'Each cell is visited a constant number of times, so the algorithm is O(rows x cols).',
              tests: [
                { stdin: '4 5\n11000\n11000\n00100\n00011', out: '3' },
                { stdin: '1 1\n0', out: '0', hidden: true },
                { stdin: '3 3\n101\n010\n101', out: '5', hidden: true },
              ],
            }),
          ],
        },
      ],
    },
  ],
};
