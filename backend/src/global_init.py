"""Global initialization registry for startup tasks."""

from typing import Any, Callable, Never, TypeVar

_global_inits: list[Callable[[], None]] = []


T = TypeVar('T')


def uninit(t: type[T]) -> T:
    """Create an uninitialized placeholder that raises on any attribute access."""
    class Uninit(t):  # type: ignore[misc, valid-type]  # pylint: disable=too-few-public-methods
        """Placeholder for uninitialized global variables."""
        def __init__(self) -> None:
            pass

    # All special methods that should raise on access to an uninitialized global
    names = [
        # Attribute access
        "__getattribute__", "__getattr__", "__setattr__", "__delattr__",
        # Container/sequence
        "__len__", "__getitem__", "__setitem__", "__delitem__", "__contains__",
        # Callable
        "__call__",
        # String representations
        "__str__", "__repr__", "__format__",
        # Comparison
        "__eq__", "__ne__", "__lt__", "__le__", "__gt__", "__ge__",
        # Numeric operations
        "__add__", "__sub__", "__mul__", "__truediv__", "__floordiv__", "__mod__", "__pow__",
        "__radd__", "__rsub__", "__rmul__", "__rtruediv__", "__rfloordiv__", "__rmod__", "__rpow__",
        "__neg__", "__pos__", "__abs__", "__invert__",
        # Bitwise operations
        "__and__", "__or__", "__xor__", "__lshift__", "__rshift__",
        "__rand__", "__ror__", "__rxor__", "__rlshift__", "__rrshift__",
        # Type conversion
        "__int__", "__float__", "__complex__", "__bool__",
        # Iteration
        "__iter__", "__next__",
        # Context manager
        "__enter__", "__exit__",
        # Descriptor protocol
        "__get__", "__set__", "__delete__", "__set_name__",
        # Hash
        "__hash__",
        # Copy
        "__copy__", "__deepcopy__",
        # Pickle
        "__getstate__", "__setstate__", "__reduce__", "__reduce_ex__",
        # Indexing variants
        "__index__",
    ]

    def catcher(self: Any, *args: Any, **kwargs: Any) -> Never:
        raise NotImplementedError("Uninitialised Global")

    for name in names:
        setattr(Uninit, name, catcher)

    return Uninit()


def add(f: Callable[[], None]) -> None:
    """Register an initialization function to be called at startup."""
    _global_inits.append(f)


def run() -> None:
    """Run all registered initialization functions."""
    for f in _global_inits:
        f()
