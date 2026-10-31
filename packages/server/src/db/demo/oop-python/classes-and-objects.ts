import { t, theory, quiz, py, type ModuleDef } from '../helpers.ts';

export const classesAndObjectsModule: ModuleDef = {
      title: 'Classes and Objects',
      lessons: [
        {
          title: 'Your First Class',
          description: 'Classes, instances, __init__ and attributes.',
          steps: [
            theory('Why Classes?', 9, t`
# Why Classes?

Functions and dictionaries get you far, but when data and the operations on it belong together, a **class** keeps them in one place.

¦¦¦python
class Dog:
    def __init__(self, name, age):
        self.name = name
        self.age = age

    def describe(self):
        return f"{self.name} is {self.age} years old"

rex = Dog("Rex", 3)
print(rex.describe())     # Rex is 3 years old
¦¦¦

## Vocabulary

- **Class**: the blueprint (¦Dog¦).
- **Instance / object**: one thing built from it (¦rex¦).
- **Attribute**: data stored on an instance (¦self.name¦).
- **Method**: a function defined in a class. Its first parameter is the instance, conventionally called ¦self¦.
- **¦__init__¦**: the initialiser, run automatically when you call ¦Dog(...)¦.

## What is self?

When you write ¦rex.describe()¦ Python calls ¦Dog.describe(rex)¦. ¦self¦ is simply the object the method was called on, which is how each instance keeps its own data.

## Class vs instance attributes

Attributes assigned on ¦self¦ belong to one instance. Names assigned directly in the class body are shared by all instances; use them for constants, not per-object state.
`),
            quiz('What is self?', 'single_choice',
              'Inside a method, what does ¦self¦ refer to?'.replaceAll('¦', '`'),
              [['The instance the method was called on', true], ['The class itself', false], ['The module that defines the class', false], ['A reserved keyword that cannot be renamed', false]],
              '¦self¦ is an ordinary parameter name (a strong convention, not a keyword) that receives the instance automatically.'.replaceAll('¦', '`')),
            py('Dog Introduction', 10, {
              statement: 'Complete the Dog class. Its describe() method must return "<name> is <age> years old". The driver code reads the name and age and prints the description.',
              input: 'Two lines: the dog name, then the age (integer).',
              output: '<name> is <age> years old',
              constraints: '0 <= age <= 30',
              starter: t`
class Dog:
    def __init__(self, name, age):
        # store name and age on the instance
        pass

    def describe(self):
        pass


name = input()
age = int(input())
dog = Dog(name, age)
print(dog.describe())
`,
              solution: t`
class Dog:
    def __init__(self, name, age):
        self.name = name
        self.age = age

    def describe(self):
        return f"{self.name} is {self.age} years old"


name = input()
age = int(input())
dog = Dog(name, age)
print(dog.describe())
`,
              hints: ['Assign to self.name and self.age inside __init__.', 'describe returns a string; the driver does the printing.'],
              explanation: '__init__ saves the constructor arguments as attributes and describe formats them.',
              tests: [
                { stdin: 'Rex\n3', out: 'Rex is 3 years old' },
                { stdin: 'Bella\n12', out: 'Bella is 12 years old' },
                { stdin: 'Pup\n0', out: 'Pup is 0 years old', hidden: true },
              ],
            }),
          ],
        },
        {
          title: 'State and Methods',
          description: 'Objects that change over time and protect their own data.',
          steps: [
            theory('Objects with State', 9, t`
# Objects with State

Objects shine when they carry **state** that changes through well-named methods.

¦¦¦python
class Counter:
    def __init__(self):
        self.value = 0

    def increment(self, by=1):
        self.value += by
        return self.value
¦¦¦

## Keep invariants inside the class

A bank account should never silently go negative. Put that rule in the method that changes the balance so every caller gets it for free:

¦¦¦python
def withdraw(self, amount):
    if amount > self.balance:
        return False
    self.balance -= amount
    return True
¦¦¦

## Public vs "private"

Python has no enforced private members. A leading underscore (¦self._balance¦) tells other programmers "internal, please use the methods". Respect it and callers can never break your invariants by accident.

## Properties

Expose a computed or validated value as if it were an attribute:

¦¦¦python
class Rectangle:
    def __init__(self, w, h):
        self.w, self.h = w, h

    @property
    def area(self):
        return self.w * self.h
¦¦¦

¦rect.area¦ now reads like data but is always up to date.
`),
            quiz('Good class design', 'multiple_choice',
              'Which statements describe good use of methods and state?',
              [
                ['Validation rules live in the methods that change the data', true],
                ['A leading underscore signals an attribute is internal', true],
                ['Every attribute should be public so callers can edit it freely', false],
                ['A @property can compute a value from other attributes', true],
              ],
              'Putting rules next to the data keeps the class consistent. Unrestricted public mutation defeats the purpose of encapsulation.'),
            py('Bank Account', 15, {
              statement:
                'Implement the Account class. Commands arrive one per line: "deposit X" adds X, "withdraw X" subtracts X, and "balance" prints "Balance: <amount>". A withdrawal larger than the balance must print "Insufficient funds" and leave the balance unchanged. New accounts start at 0.',
              input: 'Lines: deposit <int>, withdraw <int> or balance.',
              output: 'One output line per balance command, plus "Insufficient funds" for rejected withdrawals.',
              constraints: 'At most 100 commands; amounts are positive integers.',
              starter: t`
import sys


class Account:
    def __init__(self):
        self.balance = 0

    def deposit(self, amount):
        pass

    def withdraw(self, amount):
        # return True on success, False if funds are insufficient
        pass


account = Account()
for line in sys.stdin:
    parts = line.split()
    if not parts:
        continue
    if parts[0] == "deposit":
        account.deposit(int(parts[1]))
    elif parts[0] == "withdraw":
        if not account.withdraw(int(parts[1])):
            print("Insufficient funds")
    elif parts[0] == "balance":
        print(f"Balance: {account.balance}")
`,
              solution: t`
import sys


class Account:
    def __init__(self):
        self.balance = 0

    def deposit(self, amount):
        self.balance += amount

    def withdraw(self, amount):
        if amount > self.balance:
            return False
        self.balance -= amount
        return True


account = Account()
for line in sys.stdin:
    parts = line.split()
    if not parts:
        continue
    if parts[0] == "deposit":
        account.deposit(int(parts[1]))
    elif parts[0] == "withdraw":
        if not account.withdraw(int(parts[1])):
            print("Insufficient funds")
    elif parts[0] == "balance":
        print(f"Balance: {account.balance}")
`,
              hints: ['withdraw should return a boolean the driver can test.', 'Compare against self.balance before subtracting.'],
              explanation: 'The class owns the rule "never overdraw"; the driver only reacts to the result.',
              tests: [
                { stdin: 'deposit 100\nwithdraw 30\nbalance', out: 'Balance: 70' },
                { stdin: 'deposit 50\nwithdraw 80\nbalance', out: 'Insufficient funds\nBalance: 50' },
                { stdin: 'balance', out: 'Balance: 0', hidden: true },
                { stdin: 'deposit 10\ndeposit 15\nwithdraw 25\nbalance\nwithdraw 1', out: 'Balance: 0\nInsufficient funds', hidden: true },
              ],
            }),
            py('Rectangle Class', 12, {
              statement: 'Implement Rectangle with an area and a perimeter property and an is_square method. Print Area, Perimeter and whether it is a square.',
              input: 'Two integers on one line: width height.',
              output: 'Three lines: Area: A, Perimeter: P, Square: Yes/No',
              constraints: '1 <= width, height <= 1000',
              starter: t`
class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height

    @property
    def area(self):
        pass

    @property
    def perimeter(self):
        pass

    def is_square(self):
        pass


w, h = (int(x) for x in input().split())
r = Rectangle(w, h)
print(f"Area: {r.area}")
print(f"Perimeter: {r.perimeter}")
print("Square: " + ("Yes" if r.is_square() else "No"))
`,
              solution: t`
class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height

    @property
    def area(self):
        return self.width * self.height

    @property
    def perimeter(self):
        return 2 * (self.width + self.height)

    def is_square(self):
        return self.width == self.height


w, h = (int(x) for x in input().split())
r = Rectangle(w, h)
print(f"Area: {r.area}")
print(f"Perimeter: {r.perimeter}")
print("Square: " + ("Yes" if r.is_square() else "No"))
`,
              hints: ['Properties are accessed without parentheses.', 'Perimeter is twice the sum of the sides.'],
              explanation: 'Properties compute values on demand so they can never be out of date.',
              tests: [
                { stdin: '3 4', out: 'Area: 12\nPerimeter: 14\nSquare: No' },
                { stdin: '5 5', out: 'Area: 25\nPerimeter: 20\nSquare: Yes', hidden: true },
              ],
            }),
          ],
        },
      ],
};
