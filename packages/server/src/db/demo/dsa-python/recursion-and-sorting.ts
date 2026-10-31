import { t, theory, quiz, py, type ModuleDef } from '../helpers.ts';

export const recursionAndSortingModule: ModuleDef = {
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
};
