import os
import json
import time
import requests
import re
from bs4 import BeautifulSoup

def check_overlap(query, text):
    """Helper function to check if at least 50% of the query words are in the text."""
    query_words = set(re.sub(r'[^\w\s]', '', query.lower()).split())
    text_words = set(re.sub(r'[^\w\s]', '', text.lower()).split())
    if not query_words:
        return True
    return len(query_words.intersection(text_words)) / len(query_words) >= 0.5

def process_decade(decade_year):
    """Parses a local HTML file for a decade, queries Open Library, and outputs JSON."""
    filename = os.path.join("books", f"{decade_year}.htm")
    
    # 1. Check if the file exists
    if not os.path.exists(filename):
        print(f"File {filename} not found in the current directory. Skipping...")
        return

    print(f"--- Starting extraction for {filename} ---")
    
    with open(filename, "r", encoding="utf-8") as file:
        soup = BeautifulSoup(file, 'html.parser')

    # Dictionary to store unique books and aggregate their relevant years
    # We use a tuple of (Title, Author) as the unique key
    books_dict = {}

    # 2. Parse the HTML and aggregate "Relevant Years"
    for heading in soup.find_all(['h2', 'h3']):
        year_text = heading.get_text(strip=True).replace('[edit]', '')
        
        # Check if the heading is a valid 4-digit year
        if year_text.isdigit() and len(year_text) == 4:
            # Wikipedia's new markup wraps headings in a div with class 'mw-heading'
            if heading.parent and heading.parent.name == 'div' and 'mw-heading' in heading.parent.get('class', []):
                next_node = heading.parent.find_next_sibling(['ol', 'ul'])
            else:
                next_node = heading.find_next_sibling(['ol', 'ul'])
            
            if next_node:
                for item in next_node.find_all('li'):
                    text = item.get_text(separator=" ", strip=True)
                    
                    # Split Title and Author, handle ties
                    text_lower = text.lower()
                    if text_lower.startswith("tie:") or text_lower.startswith("(tie)"):
                        # Remove the tie prefix
                        if text_lower.startswith("tie:"):
                            text = text[4:].strip()
                        else:
                            text = text[5:].strip()
                            
                        # Split ties. A tie line has multiple " by " statements joined by " and "
                        parts = text.split(" by ")
                        books = []
                        if len(parts) > 2:
                            current_title = parts[0]
                            for i in range(1, len(parts) - 1):
                                # rsplit on the last " and " to separate the author of the previous book 
                                # from the title of the next book
                                if " and " in parts[i]:
                                    author, next_title = parts[i].rsplit(" and ", 1)
                                else:
                                    author, next_title = parts[i], "Unknown Title"
                                books.append((current_title, author))
                                current_title = next_title
                            books.append((current_title, parts[-1]))
                        else:
                            # Edge case: Tie prefix but only one "by" or none
                            books = [(text, "Unknown")] if len(parts) == 1 else [(parts[0], parts[1])]
                    else:
                        parts = text.split(" by ", 1)
                        if len(parts) == 2:
                            books = [(parts[0], parts[1])]
                        else:
                            books = [(parts[0], "Unknown")]
                    
                    for title, author_str in books:
                        author_list = [a.strip() for a in re.split(r',?\s+and\s+|,\s*', author_str) if a.strip()]
                        title = title.strip()
                        book_key = (title, tuple(author_list))
                        
                        # If this is the first time seeing the book, initialize it
                        if book_key not in books_dict:
                            books_dict[book_key] = {
                                "Book Title": title,
                                "Author": author_list,
                                "Year Published": None, # We will fetch this from the API
                                "Relevant Years": [],
                                "Subjects": []
                            }
                        
                        # Append the year to Relevant Years if it's not already there
                        if year_text not in books_dict[book_key]["Relevant Years"]:
                            books_dict[book_key]["Relevant Years"].append(year_text)

    print(f"Found {len(books_dict)} unique books. Fetching Open Library data...")

    # Convert the dictionary values into a list so we can iterate and save to JSON later
    final_books_list = list(books_dict.values())
    final_authors = set()
    
    # 3. Fetch Subjects and Publish Year from Open Library
    for book in final_books_list:
        title = book["Book Title"]
        authors = book["Author"]
        final_authors.update(authors)
        
        author_query = ", ".join(authors)
        author_display = " and ".join(authors)
        print(f"  -> Querying: {title} by {author_display}")
        
        url = "https://openlibrary.org/search.json"
        params = {
            "title": title,
            "author": author_query,
            # Force the API to only return the specific fields we care about to save memory
            "fields": "title,author_name,subject,first_publish_year" 
        }
        
        try:
            response = requests.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                docs = data.get("docs", [])
                
                all_subjects = set()
                earliest_pub_year = None

                title_lower = title.lower()
                authors_lower = [a.lower() for a in authors]
                
                # Iterate through EVERY edition/document returned by the search
                for doc in docs:
                    # Aggregate subjects into our set (automatically handles duplicates)
                    doc_title = doc.get("title")
                    doc_title = doc_title[0] if isinstance(doc_title, list) and doc_title else doc_title
                    doc_title = str(doc_title).lower() if doc_title else ""

                    doc_author = doc.get("author_name", [])
                    doc_author = " ".join(doc_author).lower() if isinstance(doc_author, list) else str(doc_author).lower()

                    # makes sure it doesn't grab something like a commentary on the book/author
                    if not check_overlap(title_lower, doc_title) or not any(check_overlap(a, doc_author) for a in authors_lower):
                        continue
                    
                    subjects = doc.get("subject", [])
                    for subject in subjects:
                        parts = [p.strip() for p in re.split(r',|\s+-\s+|\s*--+\s*', subject) if p.strip()]
                        all_subjects.update(parts)
                    
                    # Track the earliest publish year across all editions
                    pub_year = doc.get("first_publish_year")
                    if pub_year is not None:
                        if earliest_pub_year is None or pub_year < earliest_pub_year:
                            earliest_pub_year = pub_year
                            
                # Convert the set back to a standard Python list for the JSON output
                book["Subjects"] = list(all_subjects)
                if not all_subjects:
                    books_with_error[decade_year].append((title, author_query, "No Subjects Found"))
                book["Year Published"] = earliest_pub_year if earliest_pub_year else "Unknown"
                
            else:
                print(f"     API Error: Status {response.status_code}")
                books_with_error[decade_year].append((title, author_query, "API Error"))
                book["Subjects"] = ["API Error"]
                
        except Exception as e:
            print(f"     Request Failed: {e}")
            books_with_error[decade_year].append((title, author_query, "Request Error"))
            book["Subjects"] = ["Request Error"]
            
        # CRITICAL: Sleep for 1 second to respect Open Library's rate limits
        time.sleep(1) 

    print(f"Analyzed all books. Now analyzing authors.")

    author_subjects = []
    decade_year_int = int(decade_year)
    for author in final_authors:
        if author.lower() == "unknown":
            continue
            
        print(f"  -> Querying {author}")
        
        url = "https://openlibrary.org/search.json"
        params = {
            "author": author,
            # Force the API to only return the specific fields we care about to save memory
            "fields": "author_name,subject,first_publish_year",
            "limit": 500 # Increase limit to capture more books from prolific authors
        }
        
        try:
            response = requests.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                docs = data.get("docs", [])
                
                all_subjects = set()
                author_lower = author.lower()
                
                # Iterate through EVERY edition/document returned by the search
                for doc in docs:
                    # Verify author actually matches to avoid Open Library's fuzzy search garbage
                    doc_authors = [a.lower() for a in doc.get("author_name", [])]
                    if not any(check_overlap(author_lower, a) for a in doc_authors):
                        continue
                        
                    year = doc.get("first_publish_year")
                    if year is not None and year >= decade_year_int and year <= decade_year_int + 9:
                        subjects = doc.get("subject", [])
                        for subject in subjects:
                            parts = [p.strip() for p in re.split(r',|\s+-\s+|\s*--+\s*', subject) if p.strip()]
                            all_subjects.update(parts)
                            
                # Convert the set back to a standard Python list for the JSON output
                author_subjects.append({"Author": author, "Subjects": list(all_subjects)})

                if not all_subjects:
                    authors_with_error[decade_year].append((author, "No Subjects Found"))
                
            else:
                print(f"     API Error: Status {response.status_code}")
                authors_with_error[decade_year].append((author, "API Error"))
                author_subjects.append({"Author": author, "Subjects": ["API Error"]})
                
        except Exception as e:
            print(f"     Request Failed: {e}")
            authors_with_error[decade_year].append((author, "Request Error"))
            author_subjects.append({"Author": author, "Subjects": ["Request Error"]})
        
        # CRITICAL: Sleep for 1 second to respect Open Library's rate limits
        time.sleep(1) 

    
            
    # 4. Save to JSON File
    output_filename = os.path.join("data", f"{decade_year}s.json")
    with open(output_filename, "w", encoding="utf-8") as outfile:
        # indent=4 makes the JSON easily readable for humans
        # ensure_ascii=False ensures special characters (like accents) save correctly
        json.dump(final_books_list, outfile, indent=4, ensure_ascii=False)
        
    print(f"Finished processing the {decade_year}s! Data saved to {output_filename}\n")

    output_authors_filename = os.path.join("data", f"{decade_year}s_authors.json")
    with open(output_authors_filename, "w", encoding="utf-8") as outfile:
        # indent=4 makes the JSON easily readable for humans
        # ensure_ascii=False ensures special characters (like accents) save correctly
        json.dump(author_subjects, outfile, indent=4, ensure_ascii=False)
        
    print(f"Finished processing the {decade_year}s authors! Data saved to {output_authors_filename}\n")

# --- Execution ---

# List the decades you have downloaded HTML files for. 
# Make sure "1900.html", "1910.html", etc. are in the exact same folder as this script.
decades_to_process = ["1890", "1900", "1910", "1920", "1930", "1940", "1950", "1960", "1970", "1980", "1990", "2000"]
books_with_error = {
    "1890": [],
    "1900": [], 
    "1910": [], 
    "1920": [], 
    "1930": [], 
    "1940": [], 
    "1950": [], 
    "1960": [], 
    "1970": [], 
    "1980": [], 
    "1990": [],
    "2000": []
} # with format "decade": [(title, author)]
authors_with_error = {
    "1890": [],
    "1900": [], 
    "1910": [], 
    "1920": [], 
    "1930": [], 
    "1940": [], 
    "1950": [], 
    "1960": [], 
    "1970": [], 
    "1980": [], 
    "1990": [],
    "2000": []
}

for decade in decades_to_process:
    process_decade(decade)

error_books_output_filename = os.path.join("data", "error_books.json")
with open(error_books_output_filename, "w", encoding="utf-8") as outfile:
    json.dump(books_with_error, outfile, indent=4, ensure_ascii=False)

print("Saved all books that had either API or Request Error in error_books.json.")

error_authors_output_filename = os.path.join("data", "error_authors.json")
with open(error_authors_output_filename, "w", encoding="utf-8") as outfile:
    json.dump(authors_with_error, outfile, indent=4, ensure_ascii=False)

print("Saved all authors that had either API or Request Error in error_authors.json.")

