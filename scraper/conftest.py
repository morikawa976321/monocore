import os
import sys

# tests/ から scraper/ 直下のモジュール（store.py 等）を import できるようにする。
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
