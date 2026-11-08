import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync('App.tsx','utf8');
const speech=fs.readFileSync('src/SpeechInput.tsx','utf8');
test('new job remains the default and saved list is opened explicitly',()=>{
 assert.match(app,/const \[showJobs,setShowJobs\]=useState\(false\)/);
 assert.match(app,/const goToMyJobs=\(\)=>\{[\s\S]*?setShowJobs\(true\)/);
 assert.match(app,/\{showJobs&&<View style=\{styles\.card\}>/);
 assert.match(app,/\{!showJobs&&<>/);
 assert.match(app,/setShowJobs\(false\);\s*setShowProfile\(false\);\s*setSaveStatus\('Opened saved job'\)/);
});
test('new job keeps default business information while jobs stay in store',()=>{
 assert.match(app,/const stored=readStore\(\);\s*setSavedJobs\(stored\.jobs\)/);
 assert.match(app,/setProject\(\{\.\.\.initial,contractor:profile\.name,language:profile\.language/);
 assert.doesNotMatch(app,/setProject\(active\.project\)/);
});
test('one explicit language switch persists preference and localizes speech input',()=>{
 assert.match(app,/saveProfile\(updated\);setBusinessProfile\(updated\)/);
 assert.doesNotMatch(app,/saveProfile\(updated\);setBusinessProfile\(updated\);patch\(\{language\}\)/);
 assert.match(app,/<SpeechInput language=\{businessProfile\.language\}/);
 assert.match(speech,/language='en'/);
 assert.doesNotMatch(speech,/Dictado \/ Speech-to-text/);
});
