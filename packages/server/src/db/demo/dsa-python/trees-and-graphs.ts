import { t, theory, quiz, py, type ModuleDef } from '../helpers.ts';

export const treesAndGraphsModule: ModuleDef = {
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
};
