"""
seed_timetable.py — Populates Semesters 1, 3, and 7 timetables into portal.db
with full subject names, room locations, subject codes, and faculty information.
"""
import sys
import os

# Add project root to path
sys.path.append(os.path.dirname(__file__))

from database import clear_timetable_semester, upsert_timetable_slot

TIMETABLE_DATA = {
    1: [
        # Monday
        {"day": "Monday", "slot_time": "9:40-10:30", "slot_order": 2, "subject": "Principles of Electrical Engineering", "subject_code": "P35A", "faculty": "Dr. Samiran", "room": "321A"},
        {"day": "Monday", "slot_time": "11:30-12:20", "slot_order": 4, "subject": "Principles of Electrical Engineering Lab", "subject_code": "P35A(L)", "faculty": "Dr. Samiran", "room": "221A Lab [AC]"},
        {"day": "Monday", "slot_time": "12:25-1:15", "slot_order": 5, "subject": "Principles of Electrical Engineering Lab", "subject_code": "P35A(L)", "faculty": "Dr. Samiran", "room": "221A Lab [AC]"},
        {"day": "Monday", "slot_time": "1:20-2:10", "slot_order": 6, "subject": "Lunch", "subject_code": "", "faculty": "", "room": ""},
        {"day": "Monday", "slot_time": "2:15-3:05", "slot_order": 7, "subject": "Introduction to Problem Solving Lab", "subject_code": "P1A(L)", "faculty": "Md. Nadeem Sarwar - Assistant Professor", "room": "113B * Lab [AC]"},
        {"day": "Monday", "slot_time": "3:10-4:00", "slot_order": 8, "subject": "Introduction to Problem Solving Lab", "subject_code": "P1A(L)", "faculty": "Md. Nadeem Sarwar - Assistant Professor", "room": "113B * Lab [AC]"},

        # Tuesday
        {"day": "Tuesday", "slot_time": "9:40-10:30", "slot_order": 2, "subject": "Indian Constitution", "subject_code": "P37A", "faculty": "Dr. Akilesh - Assistant Professor", "room": "321A"},
        {"day": "Tuesday", "slot_time": "10:35-11:25", "slot_order": 3, "subject": "Introductory Topics in Statistics Probability and Calculus", "subject_code": "P34A", "faculty": "Dr. Vishal Patil - Associate Professor", "room": "321A"},
        {"day": "Tuesday", "slot_time": "11:30-12:20", "slot_order": 4, "subject": "Business Communication and Value Science - I", "subject_code": "P27A", "faculty": "Mrs. Monika Anand - Assistant Professor", "room": "321A"},
        {"day": "Tuesday", "slot_time": "12:25-1:15", "slot_order": 5, "subject": "Lunch", "subject_code": "", "faculty": "", "room": ""},
        {"day": "Tuesday", "slot_time": "1:20-2:10", "slot_order": 6, "subject": "Introduction to Problem Solving", "subject_code": "P1A", "faculty": "Md. Nadeem Sarwar - Assistant Professor", "room": "307 Room"},

        # Wednesday
        {"day": "Wednesday", "slot_time": "8:45-9:35", "slot_order": 1, "subject": "Fundamentals of Physics Lab", "subject_code": "P32A(L)", "faculty": "Dr. Rohini BS - Assistant Professor", "room": "115A * Lab [AC]"},
        {"day": "Wednesday", "slot_time": "9:40-10:30", "slot_order": 2, "subject": "Fundamentals of Physics Lab", "subject_code": "P32A(L)", "faculty": "Dr. Rohini BS - Assistant Professor", "room": "115A * Lab [AC]"},
        {"day": "Wednesday", "slot_time": "10:35-11:25", "slot_order": 3, "subject": "Principles of Electrical Engineering", "subject_code": "P35A", "faculty": "Dr. Samiran", "room": "321A"},
        {"day": "Wednesday", "slot_time": "11:30-12:20", "slot_order": 4, "subject": "Discrete Mathematics for Computer Science", "subject_code": "P30A", "faculty": "Dr. Priya Sathish - Assistant Professor", "room": "321A"},
        {"day": "Wednesday", "slot_time": "12:25-1:15", "slot_order": 5, "subject": "Fundamentals of Physics", "subject_code": "P32A", "faculty": "Dr. Rohini BS - Assistant Professor", "room": "321A"},
        {"day": "Wednesday", "slot_time": "1:20-2:10", "slot_order": 6, "subject": "Lunch", "subject_code": "", "faculty": "", "room": ""},
        {"day": "Wednesday", "slot_time": "2:15-3:05", "slot_order": 7, "subject": "Epistemology Lab", "subject_code": "P38A(L)", "faculty": "Dr. Athira - Assistant Professor", "room": "003 Epst. Lab [AC]"},
        {"day": "Wednesday", "slot_time": "3:10-4:00", "slot_order": 8, "subject": "Epistemology Lab", "subject_code": "P38A(L)", "faculty": "Dr. Athira - Assistant Professor", "room": "003 Epst. Lab [AC]"},

        # Thursday
        {"day": "Thursday", "slot_time": "11:30-12:20", "slot_order": 4, "subject": "Introductory Topics in Statistics Probability and Calculus", "subject_code": "P34A", "faculty": "Dr. Vishal Patil - Associate Professor", "room": "214C [AC]"},
        {"day": "Thursday", "slot_time": "12:25-1:15", "slot_order": 5, "subject": "Lunch", "subject_code": "", "faculty": "", "room": ""},
        {"day": "Thursday", "slot_time": "2:15-3:05", "slot_order": 7, "subject": "Introduction to Problem Solving", "subject_code": "P1A", "faculty": "Md. Nadeem Sarwar - Assistant Professor", "room": "321A"},
        {"day": "Thursday", "slot_time": "3:10-4:00", "slot_order": 8, "subject": "Business Communication and Value Science - I", "subject_code": "P27A", "faculty": "Mrs. Monika Anand - Assistant Professor", "room": "321A"},

        # Friday
        {"day": "Friday", "slot_time": "8:45-9:35", "slot_order": 1, "subject": "Fundamentals of Physics", "subject_code": "P32A", "faculty": "Dr. Rohini BS - Assistant Professor", "room": "321A"},
        {"day": "Friday", "slot_time": "9:40-10:30", "slot_order": 2, "subject": "Epistemology Lab", "subject_code": "P38A(L)", "faculty": "Dr. Athira - Assistant Professor", "room": "319 Epst. Lab [AC]"},
        {"day": "Friday", "slot_time": "10:35-11:25", "slot_order": 3, "subject": "Epistemology Lab", "subject_code": "P38A(L)", "faculty": "Dr. Athira - Assistant Professor", "room": "319 Epst. Lab [AC]"},
        {"day": "Friday", "slot_time": "11:30-12:20", "slot_order": 4, "subject": "Lunch", "subject_code": "", "faculty": "", "room": ""},
        {"day": "Friday", "slot_time": "2:15-3:05", "slot_order": 7, "subject": "Indian Constitution", "subject_code": "P37A", "faculty": "Dr. Akilesh - Assistant Professor", "room": "321A"},
        {"day": "Friday", "slot_time": "3:10-4:00", "slot_order": 8, "subject": "Discrete Mathematics for Computer Science", "subject_code": "P30A", "faculty": "Dr. Priya Sathish - Assistant Professor", "room": "321A"}
    ],
    3: [
        # Monday
        {"day": "Monday", "slot_time": "8:45-9:35", "slot_order": 1, "subject": "Object Oriented Programming Using Java", "subject_code": "P3A", "faculty": "Dr. Santhosh Kumar S", "room": "105 Room"},
        {"day": "Monday", "slot_time": "9:40-10:30", "slot_order": 2, "subject": "Computer Organization and Architecture", "subject_code": "P4A", "faculty": "Dr. Pajany M", "room": "105 Room"},
        {"day": "Monday", "slot_time": "11:30-12:20", "slot_order": 4, "subject": "Database Management Systems Lab", "subject_code": "P5A(L)", "faculty": "Dr. Lokaiah Pullagura", "room": "221A Lab [AC]"},
        {"day": "Monday", "slot_time": "12:25-1:15", "slot_order": 5, "subject": "Database Management Systems Lab", "subject_code": "P5A(L)", "faculty": "Dr. Lokaiah Pullagura", "room": "221A Lab [AC]"},
        {"day": "Monday", "slot_time": "1:20-2:10", "slot_order": 6, "subject": "Lunch", "subject_code": "", "faculty": "", "room": ""},
        {"day": "Monday", "slot_time": "2:15-3:05", "slot_order": 7, "subject": "Diploma Mathematics - 1", "subject_code": "P29A", "faculty": "Mr. Vishwanatha S", "room": "105 Room"},
        {"day": "Monday", "slot_time": "3:10-4:00", "slot_order": 8, "subject": "Formal Languages and Automata Theory", "subject_code": "P2A", "faculty": "Dr. Thiruvannamalai Sivasankar P", "room": "105 Room"},

        # Tuesday
        {"day": "Tuesday", "slot_time": "9:40-10:30", "slot_order": 2, "subject": "Design Thinking Lab", "subject_code": "P6A(L)", "faculty": "Md. Nadeem Sarwar", "room": "115A * Lab [AC]"},
        {"day": "Tuesday", "slot_time": "10:35-11:25", "slot_order": 3, "subject": "Design Thinking Lab", "subject_code": "P6A(L)", "faculty": "Md. Nadeem Sarwar", "room": "115A * Lab [AC]"},
        {"day": "Tuesday", "slot_time": "11:30-12:20", "slot_order": 4, "subject": "Lunch", "subject_code": "", "faculty": "", "room": ""},
        {"day": "Tuesday", "slot_time": "12:25-1:15", "slot_order": 5, "subject": "Placement Training", "subject_code": "P40A", "faculty": "Trainer 05", "room": "105 Room"},
        {"day": "Tuesday", "slot_time": "1:20-2:10", "slot_order": 6, "subject": "Biology for Engineers", "subject_code": "P26A", "faculty": "Dr. Shyamala", "room": "322B"},
        {"day": "Tuesday", "slot_time": "3:10-4:00", "slot_order": 8, "subject": "Database Management Systems", "subject_code": "P5A", "faculty": "Dr. Lokaiah Pullagura", "room": "105 Room"},

        # Wednesday
        {"day": "Wednesday", "slot_time": "10:35-11:25", "slot_order": 3, "subject": "Design Thinking Lab", "subject_code": "P6A(L)", "faculty": "Md. Nadeem Sarwar", "room": "113B * Lab [AC]"},
        {"day": "Wednesday", "slot_time": "11:30-12:20", "slot_order": 4, "subject": "Design Thinking Lab", "subject_code": "P6A(L)", "faculty": "Md. Nadeem Sarwar", "room": "113B * Lab [AC]"},
        {"day": "Wednesday", "slot_time": "12:25-1:15", "slot_order": 5, "subject": "Lunch", "subject_code": "", "faculty": "", "room": ""},
        {"day": "Wednesday", "slot_time": "1:20-2:10", "slot_order": 6, "subject": "Placement Training", "subject_code": "P40A", "faculty": "Trainer 05", "room": "105 Room"},
        {"day": "Wednesday", "slot_time": "2:15-3:05", "slot_order": 7, "subject": "Computer Organization and Architecture", "subject_code": "P4A", "faculty": "Dr. Pajany M", "room": "211 Room"},
        {"day": "Wednesday", "slot_time": "3:10-4:00", "slot_order": 8, "subject": "Biology for Engineers", "subject_code": "P26A", "faculty": "Dr. Shyamala", "room": "306 Room"},

        # Thursday
        {"day": "Thursday", "slot_time": "8:45-9:35", "slot_order": 1, "subject": "Object Oriented Programming Using Java Lab", "subject_code": "P3A(L)", "faculty": "Dr. Santhosh Kumar S", "room": "216A Lab [AC]"},
        {"day": "Thursday", "slot_time": "9:40-10:30", "slot_order": 2, "subject": "Object Oriented Programming Using Java Lab", "subject_code": "P3A(L)", "faculty": "Dr. Santhosh Kumar S", "room": "216A Lab [AC]"},
        {"day": "Thursday", "slot_time": "10:35-11:25", "slot_order": 3, "subject": "Placement Training", "subject_code": "P40A", "faculty": "Trainer 05", "room": "305 Room"},
        {"day": "Thursday", "slot_time": "11:30-12:20", "slot_order": 4, "subject": "Formal Languages and Automata Theory", "subject_code": "P2A", "faculty": "Dr. Thiruvannamalai Sivasankar P", "room": "105 Room"},
        {"day": "Thursday", "slot_time": "12:25-1:15", "slot_order": 5, "subject": "Lunch", "subject_code": "", "faculty": "", "room": ""},
        {"day": "Thursday", "slot_time": "1:20-2:10", "slot_order": 6, "subject": "Fundamentals of Economics", "subject_code": "P31A", "faculty": "Dr. Sachin Pavithran A P", "room": "105 Room"},
        {"day": "Thursday", "slot_time": "2:15-3:05", "slot_order": 7, "subject": "Computer Organization and Architecture Lab", "subject_code": "P4A(L)", "faculty": "Dr. Pajany M", "room": "114C * Lab [AC]"},
        {"day": "Thursday", "slot_time": "3:10-4:00", "slot_order": 8, "subject": "Computer Organization and Architecture Lab", "subject_code": "P4A(L)", "faculty": "Dr. Pajany M", "room": "114C * Lab [AC]"},

        # Friday
        {"day": "Friday", "slot_time": "8:45-9:35", "slot_order": 1, "subject": "Sports and Yoga Lab", "subject_code": "P36A(L)", "faculty": "Dr. Srinivas", "room": "Yoga - Hall"},
        {"day": "Friday", "slot_time": "9:40-10:30", "slot_order": 2, "subject": "Sports and Yoga Lab", "subject_code": "P36A(L)", "faculty": "Dr. Srinivas", "room": "Yoga - Hall"},
        {"day": "Friday", "slot_time": "10:35-11:25", "slot_order": 3, "subject": "Formal Languages and Automata Theory", "subject_code": "P2A", "faculty": "Dr. Thiruvannamalai Sivasankar P", "room": "105 Room"},
        {"day": "Friday", "slot_time": "11:30-12:20", "slot_order": 4, "subject": "Lunch", "subject_code": "", "faculty": "", "room": ""},
        {"day": "Friday", "slot_time": "12:25-1:15", "slot_order": 5, "subject": "Biology for Engineers", "subject_code": "P26A", "faculty": "Dr. Shyamala", "room": "105 Room"},
        {"day": "Friday", "slot_time": "1:20-2:10", "slot_order": 6, "subject": "Fundamentals of Economics", "subject_code": "P31A", "faculty": "Dr. Sachin Pavithran A P", "room": "105 Room"},
        {"day": "Friday", "slot_time": "2:15-3:05", "slot_order": 7, "subject": "Database Management Systems", "subject_code": "P5A", "faculty": "Dr. Lokaiah Pullagura", "room": "312 Room"},
        {"day": "Friday", "slot_time": "3:10-4:00", "slot_order": 8, "subject": "Object Oriented Programming Using Java", "subject_code": "P3A", "faculty": "Dr. Santhosh Kumar S", "room": "105 Room"}
    ],
    7: [
        # Monday
        {"day": "Monday", "slot_time": "9:40-10:30", "slot_order": 2, "subject": "Services Science and Service Operational Management", "subject_code": "P25A", "faculty": "Dr. Anjana Singha - Assistant Professor", "room": "322B"},
        {"day": "Monday", "slot_time": "11:30-12:20", "slot_order": 4, "subject": "Lunch", "subject_code": "", "faculty": "", "room": ""},
        {"day": "Monday", "slot_time": "12:25-1:15", "slot_order": 5, "subject": "Gen AI (23CSBSDE734) Lab", "subject_code": "P20A(L)", "faculty": "Dr. D Ramya Dorai - Associate Professor (ProgHead)", "room": "114C * Lab [AC]"},
        {"day": "Monday", "slot_time": "1:20-2:10", "slot_order": 6, "subject": "Gen AI (23CSBSDE734) Lab", "subject_code": "P20A(L)", "faculty": "Dr. D Ramya Dorai - Associate Professor (ProgHead)", "room": "114C * Lab [AC]"},
        {"day": "Monday", "slot_time": "3:10-4:00", "slot_order": 8, "subject": "Financial Management", "subject_code": "P17A", "faculty": "Mr. Saresh Kumar S - Assistant Professor", "room": "322B"},

        # Tuesday
        {"day": "Tuesday", "slot_time": "8:45-9:35", "slot_order": 1, "subject": "Quantum Computation and Quantum Information", "subject_code": "P21A", "faculty": "Dr. Thiruvannamalai Sivasankar P - Professor", "room": "313A"},
        {"day": "Tuesday", "slot_time": "9:40-10:30", "slot_order": 2, "subject": "IT Workshop Skylab / Matlab", "subject_code": "P23A", "faculty": "Dr. S Nagaraj - Associate Professor", "room": "312 Room"},
        {"day": "Tuesday", "slot_time": "10:35-11:25", "slot_order": 3, "subject": "IT Workshop Skylab / Matlab Lab", "subject_code": "P23A(L)", "faculty": "Dr. S Nagaraj - Associate Professor", "room": "115B * Lab [AC]"},
        {"day": "Tuesday", "slot_time": "11:30-12:20", "slot_order": 4, "subject": "IT Workshop Skylab / Matlab Lab", "subject_code": "P23A(L)", "faculty": "Dr. S Nagaraj - Associate Professor", "room": "115B * Lab [AC]"},
        {"day": "Tuesday", "slot_time": "12:25-1:15", "slot_order": 5, "subject": "Lunch", "subject_code": "", "faculty": "", "room": ""},
        {"day": "Tuesday", "slot_time": "1:20-2:10", "slot_order": 6, "subject": "Services Science and Service Operational Management", "subject_code": "P25A", "faculty": "Dr. Anjana Singha - Assistant Professor", "room": "322B"},
        {"day": "Tuesday", "slot_time": "2:15-3:05", "slot_order": 7, "subject": "Usability Design of Software Applications", "subject_code": "P16A", "faculty": "Dr. Lokaiah Pullagura - Associate Professor", "room": "322B"},
        {"day": "Tuesday", "slot_time": "3:10-4:00", "slot_order": 8, "subject": "Financial Management", "subject_code": "P17A", "faculty": "Mr. Saresh Kumar S - Assistant Professor", "room": "322B"},

        # Wednesday
        {"day": "Wednesday", "slot_time": "8:45-9:35", "slot_order": 1, "subject": "IT Project Management", "subject_code": "P24A", "faculty": "Dr. Pajany M - Assistant Professor", "room": "322B"},
        {"day": "Wednesday", "slot_time": "9:40-10:30", "slot_order": 2, "subject": "Advanced Social Text and Media Analytics Lab", "subject_code": "P22A(L)", "faculty": "Dr. Santosh Kumar S - Assistant Professor", "room": "222A Lab"},
        {"day": "Wednesday", "slot_time": "10:35-11:25", "slot_order": 3, "subject": "Advanced Social Text and Media Analytics Lab", "subject_code": "P22A(L)", "faculty": "Dr. Santosh Kumar S - Assistant Professor", "room": "222A Lab"},
        {"day": "Wednesday", "slot_time": "11:30-12:20", "slot_order": 4, "subject": "Lunch", "subject_code": "", "faculty": "", "room": ""},
        {"day": "Wednesday", "slot_time": "12:25-1:15", "slot_order": 5, "subject": "Usability Design of Software Applications Lab", "subject_code": "P16A(L)", "faculty": "Dr. Lokaiah Pullagura - Associate Professor", "room": "114B * Lab [AC]"},
        {"day": "Wednesday", "slot_time": "1:20-2:10", "slot_order": 6, "subject": "Usability Design of Software Applications Lab", "subject_code": "P16A(L)", "faculty": "Dr. Lokaiah Pullagura - Associate Professor", "room": "114B * Lab [AC]"},
        {"day": "Wednesday", "slot_time": "2:15-3:05", "slot_order": 7, "subject": "Advanced Social Text and Media Analytics", "subject_code": "P22A", "faculty": "Dr. Santosh Kumar S - Assistant Professor", "room": "127B [AC]"},
        {"day": "Wednesday", "slot_time": "3:10-4:00", "slot_order": 8, "subject": "Gen AI (23CSBSDE734)", "subject_code": "P20A", "faculty": "Dr. D Ramya Dorai - Associate Professor (ProgHead)", "room": "322B"},

        # Thursday
        {"day": "Thursday", "slot_time": "9:40-10:30", "slot_order": 2, "subject": "Usability Design of Software Applications", "subject_code": "P16A", "faculty": "Dr. Lokaiah Pullagura - Associate Professor", "room": "322B"},
        {"day": "Thursday", "slot_time": "10:35-11:25", "slot_order": 3, "subject": "Quantum Computation and Quantum Information", "subject_code": "P21A", "faculty": "Dr. Thiruvannamalai Sivasankar P - Professor", "room": "322B"},
        {"day": "Thursday", "slot_time": "11:30-12:20", "slot_order": 4, "subject": "IT Workshop Skylab / Matlab", "subject_code": "P23A", "faculty": "Dr. S Nagaraj - Associate Professor", "room": "322B"},
        {"day": "Thursday", "slot_time": "12:25-1:15", "slot_order": 5, "subject": "Financial Management", "subject_code": "P17A", "faculty": "Mr. Saresh Kumar S - Assistant Professor", "room": "322B"},
        {"day": "Thursday", "slot_time": "1:20-2:10", "slot_order": 6, "subject": "Lunch", "subject_code": "", "faculty": "", "room": ""},
        {"day": "Thursday", "slot_time": "2:15-3:05", "slot_order": 7, "subject": "Services Science and Service Operational Management", "subject_code": "P25A", "faculty": "Dr. Anjana Singha - Assistant Professor", "room": "322B"},
        {"day": "Thursday", "slot_time": "3:10-4:00", "slot_order": 8, "subject": "Advanced Social Text and Media Analytics", "subject_code": "P22A", "faculty": "Dr. Santosh Kumar S - Assistant Professor", "room": "322B"},

        # Friday
        {"day": "Friday", "slot_time": "8:45-9:35", "slot_order": 1, "subject": "IT Project Management", "subject_code": "P24A", "faculty": "Dr. Pajany M - Assistant Professor", "room": "322B"},
        {"day": "Friday", "slot_time": "9:40-10:30", "slot_order": 2, "subject": "IT Project Management Lab", "subject_code": "P24A(L)", "faculty": "Dr. Pajany M - Assistant Professor", "room": "126A Lab"},
        {"day": "Friday", "slot_time": "10:35-11:25", "slot_order": 3, "subject": "IT Project Management Lab", "subject_code": "P24A(L)", "faculty": "Dr. Pajany M - Assistant Professor", "room": "126A Lab"},
        {"day": "Friday", "slot_time": "11:30-12:20", "slot_order": 4, "subject": "Quantum Computation and Quantum Information", "subject_code": "P21A", "faculty": "Dr. Thiruvannamalai Sivasankar P - Professor", "room": "214B [AC]"},
        {"day": "Friday", "slot_time": "12:25-1:15", "slot_order": 5, "subject": "Lunch", "subject_code": "", "faculty": "", "room": ""},
        {"day": "Friday", "slot_time": "1:20-2:10", "slot_order": 6, "subject": "Gen AI (23CSBSDE734)", "subject_code": "P20A", "faculty": "Dr. D Ramya Dorai - Associate Professor (ProgHead)", "room": "322B"},
        {"day": "Friday", "slot_time": "2:15-3:05", "slot_order": 7, "subject": "IT Workshop Skylab / Matlab Lab", "subject_code": "P23A(L)", "faculty": "Dr. S Nagaraj - Associate Professor", "room": "125A Lab"},
        {"day": "Friday", "slot_time": "3:10-4:00", "slot_order": 8, "subject": "IT Workshop Skylab / Matlab Lab", "subject_code": "P23A(L)", "faculty": "Dr. S Nagaraj - Associate Professor", "room": "125A Lab"}
    ]
}

def seed():
    print("Seeding timetables...")
    for sem, slots in TIMETABLE_DATA.items():
        clear_timetable_semester(sem)
        count = 0
        for slot in slots:
            upsert_timetable_slot(
                semester=sem,
                day=slot['day'],
                slot_time=slot['slot_time'],
                slot_order=slot['slot_order'],
                subject=slot['subject'],
                subject_code=slot['subject_code'],
                faculty=slot['faculty'],
                room=slot['room']
            )
            count += 1
        print(f"  - Semester {sem}: {count} slots seeded successfully.")
    print("Done!")

if __name__ == '__main__':
    seed()
