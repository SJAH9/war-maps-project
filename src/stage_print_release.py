"""Build the explicit publication selection; never restore removed candidates."""
from src.generate_publications import generate


def stage():
    return generate()


if __name__ == '__main__':
    stage()
