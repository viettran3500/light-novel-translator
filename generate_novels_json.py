import os
import re
import json

def get_chapter_num(filename):
    match = re.search(r'chuong_(\d+)\.txt$', filename)
    return int(match.group(1)) if match else 999999

def scan_novels():
    novel_dir = 'Novel'
    if not os.path.exists(novel_dir):
        print(f"Error: {novel_dir} directory not found.")
        return []

    novels = []
    
    # List subdirectories
    subdirs = sorted([d for d in os.listdir(novel_dir) if os.path.isdir(os.path.join(novel_dir, d))])
    
    for folder in subdirs:
        folder_path = os.path.join(novel_dir, folder)
        files = [f for f in os.listdir(folder_path) if f.endswith('.txt')]
        
        # Sort files numerically
        files.sort(key=get_chapter_num)
        
        chapters = []
        for f in files:
            num = get_chapter_num(f)
            # Create a user-friendly chapter name
            chapter_title = f"Chương {num}" if num != 999999 else f.replace('.txt', '')
            chapters.append({
                "num": num if num != 999999 else 0,
                "file": f,
                "title": chapter_title
            })
            
        # Create a unique ID for the novel
        novel_id = re.sub(r'[^a-z0-9]+', '-', folder.lower()).strip('-')
        
        novels.append({
            "id": novel_id,
            "title": folder,
            "dir": folder,
            "chapterCount": len(chapters),
            "chapters": chapters
        })
        
    return novels

def main():
    print("Scanning Novel folder...")
    novels_data = scan_novels()
    
    output_file = 'novels.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(novels_data, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully generated {output_file} with {len(novels_data)} novels.")

if __name__ == '__main__':
    main()
