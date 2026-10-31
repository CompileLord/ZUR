import { t, theory, video, quiz, py, type ModuleDef } from '../helpers.ts';

export const efficiencyModule: ModuleDef = {
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
};
