"""Compatibility entry point for the RC2 shared workshop art generator."""
from pathlib import Path
from runpy import run_path

run_path(str(Path(__file__).with_name('generate-brand-art.py')), run_name='__main__')
