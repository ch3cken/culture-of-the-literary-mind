# Culture of the Literary Mind in 20th Century America
## (20220825) Enrique Jose Delgado Garcia

Welcome to the GitHub page of my project *Culture of the Literary Mind in 20th Century America*! Check the [website here](https://ch3cken.github.io/culture-of-the-literary-mind/)!

This GitHub page maintains the website and contains an archive of my methodology in the *method* folder. In this README, I will briefly explain how to understand the *method* folder.

## Method
In the *method* folder I have included all program and data used for the project, for the sake of transparency and replicability. Below, programs and folders within the *method* folder are explained.

### Programs
#### Scrapper (scrapper.py)
The scrapper.py is the first program used on the data. It accesses the best-selling books html files from the *books* folder and extracts the book titles and the authors' names locally. Then, it extracts the subjects of the books and the subjects that the author wrote about in that decade through the OpenLibrary API. This program takes a while to run. Its output is found in the *data* folder.

#### Modifier (modifier.py)
The modifier.py program helped when needing to "retry" the scraping process for certain authors. The previous scrapper.py would take note of authors where the API failed or where subjects were not found (perhaps because the OpenLibrary API has the author under a different name, because Wikipedia had used their pseudonym, or different spellings). In cases where subject was not found, I went through the error_authors.json file and changed the name of the author to fit OpenLibrary API's data, and preserved their "incorrect name" as the third value of that set. For example:
```
[
    "Elizabeth von Arnim", <- Correct name to use
    "No Subjects Found", <- Reason for being added to error_authors.json
    "Alice Cholmondeley" <- What Wikipedia called the author
]
```

#### Reader (reader.py)
reader.py would read the modified data folder (*mod_data*) and count how many times a subject appeared across authors per decade. It would save the output in *topics_per_decade.json* and *topics_trends_long.csv*. Note that, in the python file, there is a constant called ```COUNT```, which denotes how many times a subject should appear to be added to the JSON. I set COUNT to be equal to 5 initially. Then, to enable normalize_topics.py, I re-ran reader.py with ```COUNT``` being equal to 0, in order to find the count of subjects, that had obtained 5 or greater in other decades, in decades where that subject appeared less than 5 times across authors.

#### Normalize Topics (normalize_topics.py)
normalize_topics.py is an additional program that would collect all the subjects that had a frequency greater than or equal to 5 (collected through reader.py with ```COUNT = 5```, in a json called "topics_per_decade_trunc.json") and find the frequency of that subject in all decades (collected again through reader.py with ```COUNT = 0```, in a json called "topics_per_decade.json"), even if it was less than 5. This information would then be appended to the "original" JSON ("topics_per_decade_trunc.json") This would allow for precise timeline comparison when a user clicked on a subject in a decade word cloud. To use this program, one may have to change the name of the JSON files.

Do note that following these processes may not give the exact results I had. When first receiving the data from scrapper.py, I went though each JSON and cleaned up some of the subjects. For the sake of transparency, I included both the raw output *data* folder and the modified output *mod_data* folder. The "topics_per_decade_trunc.json" may also look a bit different, because of words being combined after the fact by me, such as "biographical" and "biography", and "detective & mystery" and "mystery & detective".

### Folders
#### Source Folder (books)
The *books* folder in *method* contains the lists of best-selling authors of each year, divided into each decade from 1890s to 2000s. These lists are actually html files of their respective Wikipedia page, since Wikipedia has Publishers' Weekly's list of best-selling books. I copied them and used a scraper to extract the authors' names locally.

#### Data Folders (data & mod_data)
The *data* folder contains the raw output of scrapper.py. The *mod_data* folder, on the other hand, contains my cleaned-up version of that raw output, separating certain topics that had many topics within one string and removing unnecessary parentheses statements (like *"(fictional works by one author)"*)
