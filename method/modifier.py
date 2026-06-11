import os
import json
import time
import requests
import re

def check_overlap(query, text):
    """Helper function to check if at least 50% of the query words are in the text."""
    query_words = set(re.sub(r'[^\w\s]', '', query.lower()).split())
    text_words = set(re.sub(r'[^\w\s]', '', text.lower()).split())
    if not query_words:
        return True
    return len(query_words.intersection(text_words)) / len(query_words) >= 0.5

def main():
    error_authors_file = os.path.join("data", "error_authors.json")
    if not os.path.exists(error_authors_file):
        print(f"File {error_authors_file} not found.")
        return

    with open(error_authors_file, "r", encoding="utf-8") as f:
        error_authors = json.load(f)

    for decade_year_str, authors_list in error_authors.items():
        if not authors_list:
            continue

        decade_year_int = int(decade_year_str)
        decade_file = os.path.join("data", f"new_{decade_year_str}s_authors.json")
        
        new_authors = []

        for entry in authors_list:
            query_name = entry[0]
            original_name = entry[2] if len(entry) > 2 else original_name

            print(f"-> Querying {query_name} (Original: {original_name}) for decade {decade_year_str}s")
            
            url = "https://openlibrary.org/search.json"
            params = {
                "author": query_name,
                "fields": "author_name,subject,first_publish_year",
                "limit": 500
            }
            
            try:
                response = requests.get(url, params=params)
                if response.status_code == 200:
                    data = response.json()
                    docs = data.get("docs", [])
                    
                    all_subjects = set()
                    author_lower = query_name.lower()
                    
                    for doc in docs:
                        doc_authors = [a.lower() for a in doc.get("author_name", [])]
                        if not any(check_overlap(author_lower, a) for a in doc_authors):
                            continue
                            
                        year = doc.get("first_publish_year")
                        if year is not None and year >= decade_year_int and year <= decade_year_int + 9:
                            subjects = doc.get("subject", [])
                            for subject in subjects:
                                parts = [p.strip() for p in re.split(r',|\s+-\s+|\s*--+\s*', subject) if p.strip()]
                                all_subjects.update(parts)
                                
                    new_author_entry = {"Author": query_name, "Subjects": list(all_subjects)}
                    new_authors.append(new_author_entry)
                    print(f"   Found {len(all_subjects)} subjects.")
                else:
                    print(f"   API Error: Status {response.status_code}")
            except Exception as e:
                print(f"   Request Failed: {e}")
            
            # Sleep to respect Open Library's rate limits
            time.sleep(1)
            
        with open(decade_file, "w", encoding="utf-8") as f:
            json.dump(new_authors, f, indent=4, ensure_ascii=False)
        print(f"Wrote to {decade_file}")

if __name__ == "__main__":
    main()