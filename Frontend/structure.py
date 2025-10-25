# GENERATES A TEXT FILE WITH THE FOLDER STRUCTURE OF THE CURRENT DIRECTORY
# Usage: run then check structure.txt

import os

IGNORE_FOLDERS = {
    "node_modules", ".git", ".expo", ".expo-shared",
    ".idea", ".vscode", "build", "dist", ".next",
    "__pycache__", ".DS_Store"
}

# Folders where files should be displayed (only the direct files, not subfolders)
SHOW_FILES_IN = {"backend", "app", "backend/app"}  # <-- adjust as needed

def build_tree(root, prefix="", is_root=False):
    entries = sorted(os.listdir(root))

    # Split into folders + files
    folders = [e for e in entries if os.path.isdir(os.path.join(root, e)) and e not in IGNORE_FOLDERS]
    files   = [e for e in entries if os.path.isfile(os.path.join(root, e))]

    lines = []
    all_entries = folders + files  # Folders first, then files

    for i, entry in enumerate(all_entries):
        path = os.path.join(root, entry)
        connector = "└── " if i == len(all_entries) - 1 else "├── "

        if os.path.isdir(path):
            lines.append(prefix + connector + entry + "/")
            extension = "    " if i == len(all_entries) - 1 else "│   "
            # Always recurse into subfolders (but apply SHOW_FILES_IN rule inside them)
            lines.extend(build_tree(path, prefix + extension, is_root=False))
        else:
            # Show root files
            if is_root:
                lines.append(prefix + connector + entry)
            else:
                # Show files only if parent folder is in SHOW_FILES_IN
                rel_parent = os.path.relpath(root, os.getcwd())
                if rel_parent in SHOW_FILES_IN:
                    lines.append(prefix + connector + entry)

    return lines

if __name__ == "__main__":
    parent = os.getcwd()
    project_name = os.path.basename(parent)

    lines = [project_name + "/"] + build_tree(parent, is_root=True)

    with open("structure.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))