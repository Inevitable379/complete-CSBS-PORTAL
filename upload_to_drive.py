import os
import sqlite3
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from database import update_topic_url

# If modifying these scopes, delete the file token.json.
SCOPES = ['https://www.googleapis.com/auth/drive.file']

def get_drive_service():
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        with open('token.json', 'w') as token:
            token.write(creds.to_json())
    return build('drive', 'v3', credentials=creds)

folder_cache = {}

def get_or_create_folder(service, folder_name, parent_id=None):
    cache_key = (folder_name, parent_id)
    if cache_key in folder_cache:
        return folder_cache[cache_key]

    query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        query += f" and '{parent_id}' in parents"
        
    results = service.files().list(q=query, spaces='drive', fields='files(id, name)').execute()
    files = results.get('files', [])

    if not files:
        # Create folder
        folder_metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder'
        }
        if parent_id:
            folder_metadata['parents'] = [parent_id]
            
        print(f"    [CREATING FOLDER] {folder_name}...")
        folder = service.files().create(body=folder_metadata, fields='id').execute()
        folder_id = folder.get('id')
    else:
        folder_id = files[0].get('id')
        
    folder_cache[cache_key] = folder_id
    return folder_id

def categorize_file(filename):
    lower_name = filename.lower()
    if 'syllabus' in lower_name:
        return 'Syllabus'
    elif 'tlep' in lower_name:
        return 'TLEP'
    elif 'experiment' in lower_name or 'lab' in lower_name:
        return 'Lab Experiments'
    elif 'question' in lower_name or 'bank' in lower_name or 'ia ' in lower_name or 'ia1' in lower_name or 'ia2' in lower_name or 'test' in lower_name or 'exam' in lower_name or 'practice' in lower_name:
        return 'Question Banks & IA'
    else:
        return 'Modules & Notes'

def main():
    db_path = r'c:\proper csbs portal\data\portal.db'
    base_dir = r'C:\Users\Avi\OneDrive\Desktop\jain\SEM-2'
    allowed_exts = {'.pdf', '.pptx', '.ppt', '.docx', '.doc'}
    
    # AI generated exclusion list to ignore admin junk, misplaced files, and non-module documents
    exclude_files = {
        '4 _fundamental_subspaces.pdf',
        'LA_REPORT.docx',
        '000ed0bf-62ab-4d3e-a192-bcea41a80918_Epistemology_The_Study_of_Knowledge.pdf',
        'a7062fe4-6d85-4e06-b0b7-ac97fb2217a2_Epistemology_The_Study_of_Knowledge.pdf',
        'Anany_notion_Epistemology_The_Study_of_Knowledge.pdf',
        'MentalHealth_HostelStudents.pdf',
        'Mental_Health_Report_Enhanced 4.pdf',
        'Experiential Learning_Report_Template_AIML A.docx',
        'Final Team.pdf',
        'jain-editorial-newsletter (1).pdf',
        'jain-editorial-newsletter (2).pdf',
        'jain-editorial-newsletter.pdf',
        'team-jatayu-letterhead.docx',
        'XOps_Selection_Letter_Creative (1) (2).docx',
        'XOps_Selection_Letter_Creative (1) (2).pdf'
    }

    print("Authenticating with Google Drive...")
    service = get_drive_service()
    print("Authentication successful!\n")
    
    # Create or get Master Root folder
    root_folder_id = get_or_create_folder(service, "CSBS Portal - SEM 2")
    
    # Make ROOT folder public to anyone with link (cascades to all children)
    try:
        permission = {'type': 'anyone', 'role': 'reader'}
        service.permissions().create(fileId=root_folder_id, body=permission, fields='id').execute()
        print("Set Master Folder permissions to 'Anyone with link'.\n")
    except Exception as e:
        print(f"Warning: Could not set root permissions: {e}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    courses = conn.execute('SELECT id, code, title FROM courses WHERE semester=2').fetchall()
    course_map = {c['code'].upper(): dict(c) for c in courses}
    conn.close()

    folder_map_overrides = {
        'EP': '25HSMC05',
        'EVS': '25CE101',
        'LINEAR ALGEBRA': '25BSMA07',
        'PE': '25ESEE05',
        'PYHTON PROGRAMMING': '25ESBS01',
        'SM': '25BSMA08',
        'LAB SM': '25BSMA08',
        'BCVS': '25HSMC08',
        'SS': '25HSMC06'
    }

    for folder in os.listdir(base_dir):
        folder_path = os.path.join(base_dir, folder)
        if not os.path.isdir(folder_path):
            continue
            
        matched_course = None
        f_upper = folder.upper()
        if f_upper in folder_map_overrides:
            matched_course = course_map.get(folder_map_overrides[f_upper])
            
        if not matched_course:
            for code in course_map:
                if folder.upper() in code.upper() or code.upper() in folder.upper():
                    matched_course = course_map[code]
                    break

        if not matched_course:
            print(f"Skipping local folder '{folder}' - No matching course found in DB.")
            continue
            
        course_code = matched_course['code']
        print(f"\nProcessing Course: {course_code} ...")
        
        # Create Subject Folder in Drive
        subject_folder_id = get_or_create_folder(service, course_code, root_folder_id)

        for filename in os.listdir(folder_path):
            file_path = os.path.join(folder_path, filename)
            if not os.path.isfile(file_path):
                continue
                
            name, ext = os.path.splitext(filename)
            if ext.lower() not in allowed_exts:
                print(f"  [IGNORE] {filename} (not a valid module format)")
                continue
                
            if filename in exclude_files:
                print(f"  [SKIP] {filename} (AI detected as junk/unrelated)")
                continue

            category = categorize_file(filename)
            print(f"  [{category}] {filename} ...", end="", flush=True)
            
            # Create Category Folder
            category_folder_id = get_or_create_folder(service, category, subject_folder_id)
            
            # Upload to Drive inside Category Folder
            file_metadata = {
                'name': filename,
                'parents': [category_folder_id]
            }
            media = MediaFileUpload(file_path, resumable=True)
            
            try:
                # Upload the file
                file = service.files().create(
                    body=file_metadata, media_body=media, fields='id, webViewLink').execute()
                link = file.get('webViewLink')
                
                # Update database (the web app doesn't know about subfolders, it just needs the webViewLink)
                topic_name = name.strip()
                success = update_topic_url(course_code, topic_name, link)
                
                if success:
                    print(f" DONE! Saved to DB.")
                else:
                    print(f" DONE! (DB save failed for {topic_name})")
                    
            except Exception as e:
                print(f" ERROR: {str(e)}")

    print("\nAll done! You can re-run this script anytime if you add more files.")

if __name__ == '__main__':
    main()
