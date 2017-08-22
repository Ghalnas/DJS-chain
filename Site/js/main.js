// Code illustrating the use of djs-chain
// Many additional features could be added for instance,
//  - propagate creation and removal of persons
//  - prettyer html and css

// For the demo, starts the server and read the served page.
// More information on https://github.com/ChristianQueinnec/DJS-chain

const $ = require('jquery');
const br = require('../../src/browserobj.js');

let localport = 18080;
let localhost = '127.0.0.1';
let localurl = `http://${localhost}:${localport}`;
let localwsurl = `ws://${localhost}:${localport + 1}`;

let brpersons = new br.BRTable(`${localurl}/Persons/`);

function handleUpdateMessage () {
    showBrowserObjects(brpersons._cache);
}

let wsroutes = { update: br.acceptWebSocket.update };
let wsclient = br.acceptWebSocket(localwsurl, wsroutes);
wsclient.on('update', handleUpdateMessage);

function showError (reason) {
    $('#error').html(reason);
    return false;
}

function generateLine (bro) {
    function onFocus () {
        /* jshint validthis: true */
        this.data_orig = this.innerHTML;
    }
    function onBlur () {
        /* jshint validthis: true */
        if ( this.innerHTML !== this.data_orig ) {
            $(this).trigger('propagate');
            delete this.data_orig;
        }
    }
    let persons = $('#persons');
    let line = `
        <tr id='person-${bro.id}' data-id='${bro.id}'>
        <td><button id='person-remove-${bro.id}'>-</button></td>
        <td><span id='person-nickname-${bro.id}' 
    contenteditable="true">${bro.nickname}</span></td>
        <td><span id='person-age-${bro.id}' 
    contenteditable="true">${bro.age}</span></td>
        </tr>`;
    persons.append(line);
    let jqtr = $(`#person-${bro.id}`);
    $(`#person-remove-${bro.id}`).click(function () {
        bro.remove()
            .then(function () {
                jqtr.remove();
            });
        return false;
    });
    $(`#person-nickname-${bro.id}`)
        .on('focus', onFocus)
        .on('blur', onBlur)
        .on('propagate', function () {
            let newNickname = $(`#person-nickname-${bro.id}`).html();
            bro.setProperty('nickname', newNickname)
                .catch(function (reason) {
                    $('#error').html(reason);
                });
            return false;
        });
    $(`#person-age-${bro.id}`)
        .on('focus', onFocus)
        .on('blur', onBlur)
        .on('propagate', function () {
            let newAge = $(`#person-age-${bro.id}`).html();
            bro.setProperty('age', newAge)
                .catch(showError);
            return false;
        });
    return bro;
}

function showBrowserObjects (bros) {
    let persons = $('#persons');
    persons.empty();
    bros.forEach(generateLine);
    return bros;
}

function getall () {
    brpersons.all().then(showBrowserObjects);
    return false;
}

function addPerson () {
    function normalize (s) {
        return s.replace(new RegExp('([&]nbsp;|\\s)+', 'g'), '');
    }
    let nickname = normalize($('#addperson-nickname').html());
    if ( nickname === '' ) {
        return showError("Missing nickname!");
    }        
    let age = normalize($('#addperson-age').html());
    if ( age === '' ) {
        return showError("Missing age!");
    }        
    brpersons.insert({nickname, age})
        .then((bro) => {
            generateLine(bro);
            return bro;
        });
    return false;
}

$(function () {
    $('#getall').click(getall);
    $('#addperson-button').click(addPerson);
});

// end of main.js
